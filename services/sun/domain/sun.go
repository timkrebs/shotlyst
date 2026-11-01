// Package domain computes sun event times (sunrise, golden and blue hour,
// twilight) for a location and local calendar date.
//
// It is pure: no I/O, no clock, no time zone lookup — callers pass the
// *time.Location. The algorithm is the NOAA solar calculator (Meeus,
// "Astronomical Algorithms"), including the NOAA refraction model, which is
// what docs/test-vectors/sun.json was generated with; the TypeScript port
// in the PWA (shoot-mode header) must follow this file.
package domain

import (
	"math"
	"time"
)

// Target elevations in degrees, as defined in docs/03 §4 and the test
// vectors (PhotoPills definitions for golden and blue hour).
const (
	elevSunrise = -SunApparentRadius // upper limb on the horizon; refraction is added below
	elevCivil   = -6.0               // civil twilight; also blue hour's outer edge
	elevBlueIn  = -4.0               // blue hour inner edge = golden hour outer edge
	elevGolden  = 6.0                // golden hour inner edge

	// SunApparentRadius is half the sun's apparent diameter (32′).
	SunApparentRadius = 32.0 / 60.0 / 2.0
)

// Times holds every event for one day. A nil field means the event does
// not happen that day (polar day or night).
type Times struct {
	Sunrise            *time.Time `json:"sunrise"`
	Sunset             *time.Time `json:"sunset"`
	SolarNoon          *time.Time `json:"solar_noon"`
	CivilDawn          *time.Time `json:"civil_dawn"`
	CivilDusk          *time.Time `json:"civil_dusk"`
	GoldenMorningStart *time.Time `json:"golden_morning_start"`
	GoldenMorningEnd   *time.Time `json:"golden_morning_end"`
	GoldenEveningStart *time.Time `json:"golden_evening_start"`
	GoldenEveningEnd   *time.Time `json:"golden_evening_end"`
	BlueMorningStart   *time.Time `json:"blue_morning_start"`
	BlueEveningEnd     *time.Time `json:"blue_evening_end"`
}

// Compute returns the sun times for the calendar day (year, month, day) in
// loc at latitude/longitude in degrees. Results are in loc, truncated to
// whole seconds.
//
// The day is the *local* date: every event is searched around local solar
// noon of that date, so far-east zones (Sydney, UTC+11) get the morning of
// the requested day, not the next one.
func Compute(lat, lon float64, year int, month time.Month, day int, loc *time.Location) Times {
	noon := transit(time.Date(year, month, day, 12, 0, 0, 0, loc), lon)
	at := func(elev float64, dir float64) *time.Time { return crossing(noon, lat, lon, elev, dir, loc) }

	t := Times{
		CivilDawn:          at(elevCivil, rising),
		Sunrise:            at(elevSunrise, rising),
		Sunset:             at(elevSunrise, setting),
		CivilDusk:          at(elevCivil, setting),
		GoldenMorningStart: at(elevBlueIn, rising),
		GoldenMorningEnd:   at(elevGolden, rising),
		GoldenEveningStart: at(elevGolden, setting),
		GoldenEveningEnd:   at(elevBlueIn, setting),
		BlueMorningStart:   at(elevCivil, rising),
		BlueEveningEnd:     at(elevCivil, setting),
	}
	// The "classic day" (dawn, sunrise, noon, sunset, dusk) is reported as a
	// unit: if any of its four crossings is missing, all five are null. This
	// matches the test vectors, where polar days and nights report no solar
	// noon even though a transit happens.
	// TODO(spec): decide whether solar_noon should be reported on polar days.
	if t.CivilDawn == nil || t.Sunrise == nil || t.Sunset == nil || t.CivilDusk == nil {
		t.CivilDawn, t.Sunrise, t.Sunset, t.CivilDusk = nil, nil, nil, nil
	} else {
		n := noon.In(loc).Truncate(time.Second)
		t.SolarNoon = &n
	}
	return t
}

const (
	rising  = -1.0 // morning: negative hour angle
	setting = 1.0  // evening: positive hour angle
)

// transit returns the solar noon closest to t by stepping by the current
// hour angle; two corrections converge to well under a second.
func transit(t time.Time, lon float64) time.Time {
	for range 3 {
		_, eot := position(t)
		t = t.Add(-hours(hourAngle(t, lon, eot) / 15))
	}
	return t
}

// crossing returns when the sun passes elev (apparent elevation, degrees)
// on the side of noon given by dir, or nil if it never does. Declination
// and equation of time are re-evaluated at each estimate, which is what
// keeps high latitudes (slow elevation change) within the vectors'
// tolerance.
func crossing(noon time.Time, lat, lon, elev, dir float64, loc *time.Location) *time.Time {
	geometric := elev - refraction(elev)
	t := noon
	for range 4 {
		decl, eot := position(t)
		cosH := (sinDeg(geometric) - sinDeg(lat)*sinDeg(decl)) / (cosDeg(lat) * cosDeg(decl))
		if cosH < -1 || cosH > 1 {
			return nil
		}
		target := dir * deg(math.Acos(cosH))
		t = t.Add(hours(normalize(target-hourAngle(t, lon, eot)) / 15))
	}
	out := t.In(loc).Truncate(time.Second)
	return &out
}

// refraction is the NOAA spreadsheet's atmospheric refraction (degrees) at
// an apparent elevation. The sun appears higher than it is, so the
// geometric target is elev minus this value.
func refraction(elev float64) float64 {
	if elev >= 85 {
		return 0
	}
	te := math.Tan(rad(elev))
	var arcsec float64
	switch {
	case elev > 5:
		te3 := te * te * te
		arcsec = 58.1/te - 0.07/te3 + 0.000086/(te3*te*te)
	case elev > -0.575:
		arcsec = 1735 + elev*(-518.2+elev*(103.4+elev*(-12.79+elev*0.711)))
	default:
		arcsec = -20.774 / te
	}
	return arcsec / 3600
}

// position returns the sun's declination (degrees) and the equation of
// time (minutes) at t, per the NOAA solar calculator.
func position(t time.Time) (decl, eot float64) {
	jd := float64(t.UnixNano())/float64(24*time.Hour) + 2440587.5
	c := (jd - 2451545) / 36525 // Julian centuries since J2000

	l0 := math.Mod(280.46646+c*(36000.76983+c*0.0003032), 360)
	m := 357.52911 + c*(35999.05029-0.0001537*c)
	e := 0.016708634 - c*(0.000042037+0.0000001267*c)
	center := sinDeg(m)*(1.914602-c*(0.004817+0.000014*c)) + sinDeg(2*m)*(0.019993-0.000101*c) + sinDeg(3*m)*0.000289
	omega := 125.04 - 1934.136*c
	lambda := l0 + center - 0.00569 - 0.00478*sinDeg(omega)
	eps0 := 23 + (26+(21.448-c*(46.815+c*(0.00059-c*0.001813)))/60)/60
	eps := eps0 + 0.00256*cosDeg(omega)

	decl = deg(math.Asin(sinDeg(eps) * sinDeg(lambda)))
	y := math.Pow(math.Tan(rad(eps/2)), 2)
	eot = 4 * deg(y*sinDeg(2*l0)-2*e*sinDeg(m)+4*e*y*sinDeg(m)*cosDeg(2*l0)-
		0.5*y*y*sinDeg(4*l0)-1.25*e*e*sinDeg(2*m))
	return decl, eot
}

// hourAngle is the sun's hour angle (degrees, -180..180, 0 at solar noon)
// at t for an observer at longitude lon.
func hourAngle(t time.Time, lon, eot float64) float64 {
	u := t.UTC()
	minutes := float64(u.Hour()*60+u.Minute()) + float64(u.Second())/60 + float64(u.Nanosecond())/6e10
	return normalize((minutes+eot+4*lon)/4 - 180)
}

func normalize(a float64) float64 {
	a = math.Mod(a+180, 360)
	if a < 0 {
		a += 360
	}
	return a - 180
}

func hours(h float64) time.Duration { return time.Duration(h * float64(time.Hour)) }
func rad(d float64) float64         { return d * math.Pi / 180 }
func deg(r float64) float64         { return r * 180 / math.Pi }
func sinDeg(d float64) float64      { return math.Sin(rad(d)) }
func cosDeg(d float64) float64      { return math.Cos(rad(d)) }
