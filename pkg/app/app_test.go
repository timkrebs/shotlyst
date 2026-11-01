package app

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"sync"
	"syscall"
	"testing"
	"testing/fstest"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/timkrebs/shotlyst/pkg/authx"
	"github.com/timkrebs/shotlyst/pkg/dbx/dbtest"
)

func TestMain(m *testing.M) { dbtest.Main(m) }

type demoConfig struct {
	Greeting string `env:"DEMO_GREETING" default:"hi"`
	Token    string `env:"DEMO_TOKEN" secret:"true"`
}

// syncBuffer lets the test read logs while the server goroutine writes.
type syncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}
func (s *syncBuffer) lines(t *testing.T) []map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(s.b.String()), "\n") {
		var m map[string]any
		if err := json.Unmarshal([]byte(l), &m); err != nil {
			t.Fatalf("non-JSON log line %q", l)
		}
		out = append(out, m)
	}
	return out
}

func publicKey(t *testing.T) string {
	t.Helper()
	var b bytes.Buffer
	if err := authx.WriteKeyEnv(&b, rand.Reader); err != nil {
		t.Fatal(err)
	}
	_, after, _ := strings.Cut(b.String(), "SHOTLYST_AUTH_PUBLIC_KEY=")
	return strings.TrimSpace(after)
}

func lookup(m map[string]string) func(string) (string, bool) {
	return func(k string) (string, bool) { v, ok := m[k]; return v, ok }
}

func demo(migrations fstest.MapFS) Options[demoConfig] {
	o := Options[demoConfig]{
		Name: "demo", Version: "9.9.9", Prefix: "/api/v1/demo", Schema: "demo",
		Routes: func(r chi.Router, d Deps[demoConfig]) error {
			r.Get("/hello", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(d.Config.Greeting)) })
			return nil
		},
	}
	if migrations != nil {
		o.Migrations = migrations
	}
	return o
}

func TestLifecycleLogLines(t *testing.T) {
	logs := &syncBuffer{}
	sig := make(chan os.Signal, 1)
	addr := make(chan string, 1)
	done := make(chan int, 1)
	go func() {
		done <- run(demo(nil), env{
			lookup: lookup(map[string]string{
				"SHOTLYST_ADDR": "127.0.0.1:0", "SHOTLYST_LOG_FORMAT": "json", "SHOTLYST_AUTH_PUBLIC_KEY": publicKey(t),
				"SHOTLYST_DEMO_TOKEN": "s3cret", "POD_NAME": "demo-abc", "POD_NAMESPACE": "shotlyst", "NODE_NAME": "k8s-cp-01",
			}),
			out: logs, signals: sig, onListen: func(a string) { addr <- a },
		})
	}()

	base := "http://" + <-addr
	for path, want := range map[string]int{"/healthz": 200, "/readyz": 200, "/metrics": 200, "/api/v1/demo/hello": 200, "/hello": 404} {
		resp, err := http.Get(base + path)
		if err != nil {
			t.Fatal(err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != want {
			t.Errorf("GET %s = %d, want %d", path, resp.StatusCode, want)
		}
	}
	sig <- syscall.SIGTERM
	if code := <-done; code != 0 {
		t.Fatalf("exit code %d", code)
	}

	assertLifecycle(t, logs.lines(t))
}

// assertLifecycle checks pod fields on every line, the redacted config on
// "starting", the signal on "shutting down" and the overall order.
func assertLifecycle(t *testing.T, lines []map[string]any) {
	t.Helper()
	var msgs []string
	for _, l := range lines {
		msgs = append(msgs, l["msg"].(string))
		if l["pod"] != "demo-abc" || l["namespace"] != "shotlyst" || l["node"] != "k8s-cp-01" || l["service"] != "demo" || l["version"] != "9.9.9" {
			t.Errorf("line missing pod fields: %v", l)
		}
		if l["msg"] == "starting" {
			cfg := l["config"].(map[string]any)
			if cfg["SHOTLYST_DEMO_TOKEN"] != "***" || cfg["SHOTLYST_DEMO_GREETING"] != "hi" {
				t.Errorf("starting config not redacted/complete: %v", cfg)
			}
		}
		if l["msg"] == "shutting down" && l["signal"] != "terminated" {
			t.Errorf("shutdown line: %v", l)
		}
	}
	joined := strings.Join(msgs, ",")
	if !strings.HasPrefix(joined, "starting,listening,") || !strings.HasSuffix(joined, "shutting down,stopped") {
		t.Errorf("lifecycle order: %s", joined)
	}
}

func TestInvalidConfigExits2(t *testing.T) {
	logs := &syncBuffer{}
	code := run(demo(fstest.MapFS{}), env{lookup: lookup(map[string]string{"SHOTLYST_LOG_FORMAT": "json"}), out: logs})
	if code != 2 {
		t.Fatalf("exit code %d", code)
	}
	last := logs.lines(t)[1]
	errMsg, _ := last["error"].(string)
	if last["msg"] != "invalid configuration" || !strings.Contains(errMsg, "SHOTLYST_AUTH_PUBLIC_KEY is required") ||
		!strings.Contains(errMsg, "SHOTLYST_DATABASE_URL is required") {
		t.Errorf("unexpected line: %v", last)
	}
}

func TestMigrateSubcommand(t *testing.T) {
	migrations := fstest.MapFS{"0001_init.sql": {Data: []byte("-- +goose Up\nCREATE TABLE things (id int);\n")}}
	logs := &syncBuffer{}
	vars := map[string]string{"SHOTLYST_LOG_FORMAT": "json", "SHOTLYST_AUTH_PUBLIC_KEY": publicKey(t),
		"SHOTLYST_DATABASE_URL": dbtest.URL(t)}
	start := time.Now()
	if code := run(demo(migrations), env{args: []string{"migrate"}, lookup: lookup(vars), out: logs}); code != 0 {
		t.Fatalf("exit code %d, logs: %v", code, logs.lines(t))
	}
	if time.Since(start) > 30*time.Second {
		t.Error("migrate took suspiciously long")
	}
	var applied map[string]any
	for _, l := range logs.lines(t) {
		if l["msg"] == "migrations applied" {
			applied = l
		}
		if l["msg"] == "starting" && l["config"].(map[string]any)["SHOTLYST_DATABASE_URL"] != "***" {
			t.Error("database url not redacted")
		}
	}
	if applied == nil || applied["from"] != float64(0) || applied["to"] != float64(1) || applied["schema"] != "demo" {
		t.Errorf("migrations applied line: %v", applied)
	}
}
