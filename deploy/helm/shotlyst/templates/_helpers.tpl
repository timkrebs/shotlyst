{{/*
Shared helpers. Everything that would otherwise be repeated per service
lives here: labels, image reference, the Downward-API env block, probes
and the security context.
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

{{- define "shotlyst.image" -}}
{{ .root.Values.image.registry }}-{{ .name }}:{{ .root.Values.image.tag | default .root.Chart.AppVersion }}
{{- end }}

{{/* Env every Go service needs: pod identity for logs + shared settings. */}}
{{- define "shotlyst.commonEnv" -}}
- name: POD_NAME
  valueFrom: { fieldRef: { fieldPath: metadata.name } }
- name: POD_NAMESPACE
  valueFrom: { fieldRef: { fieldPath: metadata.namespace } }
- name: NODE_NAME
  valueFrom: { fieldRef: { fieldPath: spec.nodeName } }
- name: SHOTLYST_LOG_FORMAT
  value: json
- name: SHOTLYST_LOG_LEVEL
  value: {{ .Values.logLevel | quote }}
- name: SHOTLYST_AUTO_MIGRATE
  value: "false"
- name: SHOTLYST_BASE_URL
  value: {{ printf "%s://%s" (ternary "https" "http" .Values.ingress.tls) .Values.ingress.host | quote }}
- name: SHOTLYST_AUTH_PUBLIC_KEY
  valueFrom: { secretKeyRef: { name: {{ .Release.Name }}-auth, key: publicKey } }
{{- end }}

{{- define "shotlyst.probes" -}}
livenessProbe:
  httpGet: { path: /healthz, port: http }
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /readyz, port: http }
  periodSeconds: 5
{{- end }}

{{- define "shotlyst.securityContext" -}}
runAsNonRoot: true
runAsUser: 65532
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities: { drop: ["ALL"] }
seccompProfile: { type: RuntimeDefault }
{{- end }}
