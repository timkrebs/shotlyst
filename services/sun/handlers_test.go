package sun

import (
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/timkrebs/shotlyst/pkg/app"
	"github.com/timkrebs/shotlyst/pkg/app/apptest"
)

func harness(t *testing.T) *apptest.Harness {
	t.Helper()
	o := app.Options[Config]{Name: "sun", Prefix: Prefix, Routes: Routes}
	return apptest.New(t, o, &Config{}, apptest.NewKeys(t), nil)
}

const munich = Prefix + "/times?lat=48.1374&lon=11.5755&date=2026-06-21&tz=Europe/Berlin"

func TestTimesRequiresSession(t *testing.T) {
	h := harness(t)
	rec := h.Do(http.MethodGet, munich, nil, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rec.Code)
	}
	if !strings.Contains(h.Logs.String(), `"problem_type":"unauthorized"`) || !strings.Contains(h.Logs.String(), `"path":"/api/v1/sun/times"`) {
		t.Errorf("401 not logged with problem_type: %s", h.Logs)
	}
}

func TestTimesMunich(t *testing.T) {
	h := harness(t)
	user := uuid.New()
	rec := h.Do(http.MethodGet, munich, nil, h.Token(user))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	body := apptest.JSON(t, rec)
	// Exact vector values are covered in domain; here we check the wire
	// shape: zone offset preserved, whole seconds, all keys present.
	if s, _ := body["sunrise"].(string); !strings.HasPrefix(s, "2026-06-21T05:1") || !strings.HasSuffix(s, "+02:00") || len(s) != len("2026-06-21T05:13:46+02:00") {
		t.Errorf("sunrise = %v", body["sunrise"])
	}
	if len(body) != 11 {
		t.Errorf("want 11 fields, got %d: %v", len(body), body)
	}
	if rec.Header().Get("Cache-Control") != "private, max-age=3600" {
		t.Errorf("cache-control %q", rec.Header().Get("Cache-Control"))
	}
	if !strings.Contains(h.Logs.String(), `"path":"/api/v1/sun/times"`) || !strings.Contains(h.Logs.String(), `"user_id":"`+user.String()+`"`) {
		t.Errorf("request line missing route or user: %s", h.Logs)
	}

	// Second call is served from the cache and must be identical.
	again := h.Do(http.MethodGet, munich, nil, h.Token(user))
	if again.Body.String() != rec.Body.String() {
		t.Error("cached response differs")
	}
}

func TestTimesPolarNightHasNulls(t *testing.T) {
	h := harness(t)
	rec := h.Do(http.MethodGet, Prefix+"/times?lat=69.6496&lon=18.956&date=2026-12-21&tz=Europe/Oslo", nil, h.Token(uuid.New()))
	body := apptest.JSON(t, rec)
	if rec.Code != 200 || body["sunrise"] != nil || body["blue_morning_start"] == nil {
		t.Fatalf("status %d body %v", rec.Code, body)
	}
}

func TestTimesValidation(t *testing.T) {
	h := harness(t)
	rec := h.Do(http.MethodGet, Prefix+"/times?lat=91&lon=abc&date=21.06.2026&tz=Local", nil, h.Token(uuid.New()))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status %d", rec.Code)
	}
	errs := apptest.JSON(t, rec)["errors"].([]any)
	fields := map[string]bool{}
	for _, e := range errs {
		fields[e.(map[string]any)["field"].(string)] = true
	}
	for _, f := range []string{"lat", "lon", "date", "tz"} {
		if !fields[f] {
			t.Errorf("no error for %s: %v", f, errs)
		}
	}
}
