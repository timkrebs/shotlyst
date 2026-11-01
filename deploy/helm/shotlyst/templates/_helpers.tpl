{{/*
Shared helpers. Everything that would otherwise be repeated per service
lives here: labels, image reference, the env block, probes, the security
context and the DB secret/URL names. The Deployment and the migration Job
render the same env from "shotlyst.serviceEnv", so they can never drift.
*/}}

{{- define "shotlyst.labels" -}}
app.kubernetes.io/name: shotlyst
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "shotlyst.selector" -}}
app.kubernetes.io/name: shotlyst
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/* Feature labels NetworkPolicies key on (shared by Deployment and Job pods). */}}
{{- define "shotlyst.featureLabels" -}}
{{- if .svc.db }}
shotlyst.io/db: "true"
{{- end }}
{{- if .svc.s3 }}
shotlyst.io/s3: "true"
{{- end }}
{{- end }}

{{- define "shotlyst.tag" -}}
{{ .Values.image.tag | default .Chart.AppVersion }}
{{- end }}

{{- define "shotlyst.image" -}}
{{ .root.Values.image.registry }}-{{ .name }}:{{ include "shotlyst.tag" .root }}
{{- end }}

{{- define "shotlyst.authSecret" -}}{{ .Release.Name }}-auth{{- end }}
{{- define "shotlyst.s3Secret" -}}{{ .Release.Name }}-s3{{- end }}
{{- define "shotlyst.dbSecret" -}}{{ .root.Release.Name }}-db-{{ .name }}{{- end }}
{{- define "shotlyst.pgCluster" -}}{{ .Release.Name }}-pg{{- end }}

{{/* Role password for one service: sha256(seed/db/name), stable across upgrades. */}}
{{- define "shotlyst.dbPassword" -}}
{{- $seed := .root.Values.postgres.passwordSeed | default .root.Values.auth.privateKey -}}
{{- if not $seed }}{{ fail "postgres.passwordSeed (or auth.privateKey) is required to derive database passwords" }}{{ end -}}
{{- printf "%s/db/%s" $seed .name | sha256sum | trunc 32 -}}
{{- end }}

{{- define "shotlyst.dbURL" -}}
{{- if .root.Values.postgres.external.url -}}
{{ .root.Values.postgres.external.url }}
{{- else -}}
postgres://{{ .name }}:{{ include "shotlyst.dbPassword" . }}@{{ include "shotlyst.pgCluster" .root }}-rw:5432/shotlyst?sslmode=require
{{- end -}}
{{- end }}

{{/* Env for one Go service (Deployment and migration Job). Args: root, name, svc. */}}
{{- define "shotlyst.serviceEnv" -}}
{{- $root := .root -}}
- name: POD_NAME
  valueFrom: { fieldRef: { fieldPath: metadata.name } }
- name: POD_NAMESPACE
  valueFrom: { fieldRef: { fieldPath: metadata.namespace } }
- name: NODE_NAME
  valueFrom: { fieldRef: { fieldPath: spec.nodeName } }
- name: GOMEMLIMIT
  valueFrom: { resourceFieldRef: { resource: limits.memory } }
- name: SHOTLYST_LOG_FORMAT
  value: json
- name: SHOTLYST_LOG_LEVEL
  value: {{ $root.Values.logLevel | quote }}
- name: SHOTLYST_AUTO_MIGRATE
  value: "false"
- name: SHOTLYST_TRUSTED_PROXIES
  value: {{ $root.Values.trustedProxies | quote }}
- name: SHOTLYST_BASE_URL
  value: {{ printf "%s://%s" (ternary "https" "http" $root.Values.ingress.tls) $root.Values.ingress.host | quote }}
- name: SHOTLYST_AUTH_PUBLIC_KEY
  valueFrom: { secretKeyRef: { name: {{ include "shotlyst.authSecret" $root }}, key: publicKey } }
{{- if .svc.db }}
- name: SHOTLYST_DATABASE_URL
  valueFrom: { secretKeyRef: { name: {{ include "shotlyst.dbSecret" . }}, key: url } }
{{- end }}
{{- if .svc.s3 }}
- name: SHOTLYST_S3_ENDPOINT
  value: {{ $root.Values.s3.endpoint | quote }}
- name: SHOTLYST_S3_BUCKET
  value: {{ $root.Values.s3.bucket | quote }}
- name: SHOTLYST_S3_ACCESS_KEY
  valueFrom: { secretKeyRef: { name: {{ include "shotlyst.s3Secret" $root }}, key: accessKey } }
- name: SHOTLYST_S3_SECRET_KEY
  valueFrom: { secretKeyRef: { name: {{ include "shotlyst.s3Secret" $root }}, key: secretKey } }
{{- end }}
{{- if eq .name "identity" }}
- name: SHOTLYST_AUTH_PRIVATE_KEY
  valueFrom: { secretKeyRef: { name: {{ include "shotlyst.authSecret" $root }}, key: privateKey } }
{{- end }}
{{- range $k, $v := .svc.env }}
- name: {{ $k }}
  value: {{ $v | quote }}
{{- end }}
{{- end }}

{{- define "shotlyst.probes" -}}
livenessProbe:
  httpGet: { path: /healthz, port: http }
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /readyz, port: http }
  periodSeconds: 5
{{- end }}

{{/* Pod-level settings shared by every workload. */}}
{{- define "shotlyst.podSpec" -}}
automountServiceAccountToken: false
securityContext:
  runAsNonRoot: true
  seccompProfile: { type: RuntimeDefault }
{{- with .Values.image.pullSecrets }}
imagePullSecrets: {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{/* Container security context; pass (dict "uid" N) to override the distroless nonroot uid. */}}
{{- define "shotlyst.securityContext" -}}
runAsNonRoot: true
runAsUser: {{ .uid | default 65532 }}
runAsGroup: {{ .uid | default 65532 }}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities: { drop: ["ALL"] }
seccompProfile: { type: RuntimeDefault }
{{- end }}

{{/* Non-empty when any service needs S3 credentials. */}}
{{- define "shotlyst.s3Users" -}}
{{- range $name, $svc := .Values.services }}{{ if $svc.s3 }}{{ $name }} {{ end }}{{ end -}}
{{- end }}

{{/* CNPG barman object store (backup target and recovery source). Args: root, serverName. */}}
{{- define "shotlyst.barmanStore" -}}
destinationPath: {{ .root.Values.postgres.cnpg.backup.destinationPath }}
endpointURL: {{ .root.Values.s3.endpoint }}
serverName: {{ .serverName }}
s3Credentials:
  accessKeyId: { name: {{ include "shotlyst.s3Secret" .root }}, key: accessKey }
  secretAccessKey: { name: {{ include "shotlyst.s3Secret" .root }}, key: secretKey }
{{- end }}

{{/* Non-empty when S3 credentials are needed: bundled MinIO, an s3 service, or CNPG backup/recovery. */}}
{{- define "shotlyst.needsS3" -}}
{{- $cnpg := .Values.postgres.cnpg -}}
{{- $cnpgBackup := and $cnpg.enabled (or $cnpg.backup.enabled $cnpg.recovery.enabled) (not .Values.postgres.external.url) -}}
{{- if or .Values.s3.minio.enabled (include "shotlyst.s3Users" .) $cnpgBackup }}true{{ end -}}
{{- end }}

{{/* Non-empty when any service owns a schema. */}}
{{- define "shotlyst.dbUsers" -}}
{{- range $name, $svc := .Values.services }}{{ if $svc.db }}{{ $name }} {{ end }}{{ end -}}
{{- end }}
