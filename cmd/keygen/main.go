// Command keygen prints a fresh Ed25519 session-token keypair as .env lines
// (`go run ./cmd/keygen >> .env`). The private key goes to identity only;
// the public key to every service. See pkg/authx.
package main

import (
	"crypto/rand"
	"fmt"
	"os"

	"github.com/timkrebs/shotlyst/pkg/authx"
)

func main() {
	if err := authx.WriteKeyEnv(os.Stdout, rand.Reader); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
