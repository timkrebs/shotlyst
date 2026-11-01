package domain

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

// vectorFile is shared with the TypeScript port (CLAUDE.md: Go and TS are
// both tested against it).
const vectorFile = "../../../docs/test-vectors/sun.json"

const tolerance = 120 * time.Second

type vector struct {
	Name string  `json:"name"`
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
	Date string  `json:"date"`
	TZ   string  `json:"tz"`
	Times
}

func loadVectors(t *testing.T) []vector {
	t.Helper()
	b, err := os.ReadFile(vectorFile)
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []vector `json:"cases"`
	}
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) == 0 {
		t.Fatal("no vectors")
	}
	return f.Cases
}

func fields(t Times) map[string]*time.Time {
	return map[string]*time.Time{
		"sunrise": t.Sunrise, "sunset": t.Sunset, "solar_noon": t.SolarNoon,
		"civil_dawn": t.CivilDawn, "civil_dusk": t.CivilDusk,
		"golden_morning_start": t.GoldenMorningStart, "golden_morning_end": t.GoldenMorningEnd,
		"golden_evening_start": t.GoldenEveningStart, "golden_evening_end": t.GoldenEveningEnd,
		"blue_morning_start": t.BlueMorningStart, "blue_evening_end": t.BlueEveningEnd,
	}
}

func TestVectors(t *testing.T) {
	for _, v := range loadVectors(t) {
		t.Run(v.Name, func(t *testing.T) {
			loc, err := time.LoadLocation(v.TZ)
			if err != nil {
				t.Fatal(err)
			}
			d, err := time.Parse(time.DateOnly, v.Date)
			if err != nil {
				t.Fatal(err)
			}
			got := fields(Compute(v.Lat, v.Lon, d.Year(), d.Month(), d.Day(), loc))
			for name, want := range fields(v.Times) {
				g := got[name]
				switch {
				case want == nil && g != nil:
					t.Errorf("%s: got %s, want null", name, g.Format(time.RFC3339))
				case want != nil && g == nil:
					t.Errorf("%s: got null, want %s", name, want.Format(time.RFC3339))
				case want != nil:
					if diff := g.Sub(*want).Abs(); diff > tolerance {
						t.Errorf("%s: got %s, want %s (off by %s)", name, g.Format(time.RFC3339), want.Format(time.RFC3339), diff)
					}
					if _, off := g.Zone(); func() bool { _, w := want.Zone(); return w != off }() {
						t.Errorf("%s: offset differs: got %s", name, g.Format(time.RFC3339))
					}
				}
			}
		})
	}
}

// TestEventOrder checks the invariants a sun strip relies on, on a date
// with every event present.
func TestEventOrder(t *testing.T) {
	loc, _ := time.LoadLocation("Europe/Berlin")
	s := Compute(47.421, 10.985, 2026, time.March, 20, loc)
	order := []*time.Time{s.BlueMorningStart, s.GoldenMorningStart, s.Sunrise, s.GoldenMorningEnd, s.SolarNoon,
		s.GoldenEveningStart, s.Sunset, s.GoldenEveningEnd, s.BlueEveningEnd}
	for i := 1; i < len(order); i++ {
		if !order[i-1].Before(*order[i]) {
			t.Errorf("event %d (%s) not before event %d (%s)", i-1, order[i-1], i, order[i])
		}
	}
	if !s.CivilDawn.Equal(*s.BlueMorningStart) {
		t.Error("civil dawn and blue hour start use the same elevation")
	}
}

func TestRefractionContinuity(t *testing.T) {
	// The NOAA model is piecewise; each branch must roughly meet the next
	// so tiny elevation changes never jump event times.
	for _, edge := range []float64{5, -0.575} {
		if d := refraction(edge+1e-9) - refraction(edge-1e-9); d > 0.01 || d < -0.01 {
			t.Errorf("refraction jumps by %.4f° at %.3f°", d, edge)
		}
	}
	if refraction(89) != 0 {
		t.Error("no refraction near zenith")
	}
}
