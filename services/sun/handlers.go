package sun

import (
	"math"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/timkrebs/shotlyst/pkg/clientx"
	"github.com/timkrebs/shotlyst/pkg/httpx"
	"github.com/timkrebs/shotlyst/services/sun/domain"
)

type handlers struct {
	cache *clientx.Cache[cacheKey, domain.Times]
}

// cacheKey identifies one computation. Coordinates are rounded to 4
// decimals (~11 m) before computing, which changes results by well under a
// second but lets nearby requests share an entry.
type cacheKey struct {
	lat, lon float64
	date     string
	tz       string
}

// times handles GET /times?lat=&lon=&date=&tz= and returns every event in
// the requested zone, null for events that do not occur that day.
func (h *handlers) times(w http.ResponseWriter, r *http.Request) {
	q, errs := parseTimesQuery(r.URL.Query())
	if len(errs) > 0 {
		httpx.ProblemValidation(w, r, errs)
		return
	}
	key := cacheKey{lat: q.lat, lon: q.lon, date: q.date.Format(time.DateOnly), tz: q.loc.String()}
	t, ok := h.cache.Get(key)
	if !ok {
		t = domain.Compute(q.lat, q.lon, q.date.Year(), q.date.Month(), q.date.Day(), q.loc)
		h.cache.Set(key, t)
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	httpx.Encode(w, http.StatusOK, t)
}

type timesQuery struct {
	lat, lon float64
	date     time.Time
	loc      *time.Location
}

// parseTimesQuery validates all four parameters and reports every problem
// at once so the client can fix them in one round trip.
func parseTimesQuery(v url.Values) (timesQuery, []httpx.FieldError) {
	var q timesQuery
	var errs []httpx.FieldError
	coord := func(name string, limit float64) float64 {
		f, err := strconv.ParseFloat(v.Get(name), 64)
		if err != nil || math.IsNaN(f) || math.Abs(f) > limit {
			errs = append(errs, httpx.FieldError{Field: name, Message: "must be a number between -" +
				strconv.Itoa(int(limit)) + " and " + strconv.Itoa(int(limit))})
			return 0
		}
		return math.Round(f*1e4) / 1e4
	}
	q.lat = coord("lat", 90)
	q.lon = coord("lon", 180)

	d, err := time.Parse(time.DateOnly, v.Get("date"))
	if err != nil {
		errs = append(errs, httpx.FieldError{Field: "date", Message: "must be a date (YYYY-MM-DD)"})
	}
	q.date = d

	// "" and "Local" are valid for LoadLocation but would silently mean UTC
	// or the server's zone; require a real IANA name.
	tz := v.Get("tz")
	loc, err := time.LoadLocation(tz)
	if tz == "" || tz == "Local" || err != nil {
		errs = append(errs, httpx.FieldError{Field: "tz", Message: "must be an IANA time zone, e.g. Europe/Berlin"})
	}
	q.loc = loc
	return q, errs
}
