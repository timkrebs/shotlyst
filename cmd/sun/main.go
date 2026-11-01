// Command sun runs the stateless sun-times service. All wiring lives in
// pkg/app so this file stays a one-liner; see docs/02-architecture.md §3.
package main

import (
	"github.com/timkrebs/shotlyst/pkg/app"
	"github.com/timkrebs/shotlyst/services/sun"
)

// version is injected at build time via -ldflags "-X main.version=…".
var version = "dev"

func main() {
	app.Run(app.Options[sun.Config]{
		Name:    "sun",
		Version: version,
		Prefix:  sun.Prefix,
		Routes:  sun.Routes,
	})
}
