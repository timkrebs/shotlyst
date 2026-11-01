// Command identity runs the accounts and sessions service. All wiring
// lives in pkg/app so this file stays a one-liner; see docs/02 §3.
package main

import (
	"github.com/timkrebs/shotlyst/pkg/app"
	"github.com/timkrebs/shotlyst/services/identity"
)

// version is injected at build time via -ldflags "-X main.version=…".
var version = "dev"

func main() {
	app.Run(app.Options[identity.Config]{
		Name: "identity", Version: version, Prefix: identity.Prefix,
		Schema: "identity", Migrations: identity.Migrations, Routes: identity.Routes,
	})
}
