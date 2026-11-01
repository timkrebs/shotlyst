// Package config loads service configuration from SHOTLYST_* environment
// variables into plain structs.
//
// It exists so every service reads configuration the same way (one set of
// tags, one set of error messages) and so the startup log line can print the
// effective configuration with secrets redacted. It must not read files,
// flags or remote config stores: env is the only source, which keeps Compose
// and Helm symmetric.
//
// Supported struct tags:
//
//	env:"NAME"            variable name, prefixed with the Load prefix
//	env:"NAME,noprefix"   variable name used verbatim (Downward-API fields)
//	default:"value"       used when the variable is unset or empty
//	required:"true"       Load fails when the variable is unset and has no default
//	secret:"true"         value is rendered as *** by Redacted and String
//
// Supported field types: string, bool, int, int64, float64, time.Duration.
package config

import (
	"errors"
	"fmt"
	"os"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Redaction is the placeholder printed instead of a secret value.
const Redaction = "***"

// Lookup reads one environment variable. It matches os.LookupEnv and exists
// so tests can load config from a map without touching the process env.
type Lookup func(key string) (string, bool)

// Load fills dst (a pointer to a struct) from the process environment.
// Every missing required variable is reported at once so a broken deploy
// shows all problems in a single log line instead of one per restart.
func Load(prefix string, dst any) error {
	return LoadFrom(os.LookupEnv, prefix, dst)
}

// LoadFrom is Load with an injectable lookup function, used by tests.
func LoadFrom(lookup Lookup, prefix string, dst any) error {
	rv := reflect.ValueOf(dst)
	if rv.Kind() != reflect.Pointer || rv.Elem().Kind() != reflect.Struct {
		return errors.New("config: dst must be a pointer to a struct")
	}
	var problems []string
	walk(rv.Elem(), prefix, func(f reflect.Value, name string, tag reflect.StructTag) {
		raw, ok := lookup(name)
		if !ok || raw == "" {
			raw, ok = tag.Lookup("default")
		}
		if !ok {
			if tag.Get("required") == "true" {
				problems = append(problems, name+" is required")
			}
			return
		}
		if err := set(f, raw); err != nil {
			problems = append(problems, fmt.Sprintf("%s: %v", name, err))
		}
	})
	if len(problems) > 0 {
		return fmt.Errorf("config: %s", strings.Join(problems, "; "))
	}
	return nil
}

// Redacted returns the loaded configuration as variable name → value with
// secrets replaced by Redaction (or left empty when unset, so "missing" and
// "set" stay distinguishable in logs). Used for the "starting" log line.
func Redacted(prefix string, src any) map[string]string {
	out := map[string]string{}
	rv := reflect.ValueOf(src)
	if rv.Kind() == reflect.Pointer {
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return out
	}
	walk(rv, prefix, func(f reflect.Value, name string, tag reflect.StructTag) {
		v := fmt.Sprint(f.Interface())
		if tag.Get("secret") == "true" && v != "" {
			v = Redaction
		}
		out[name] = v
	})
	return out
}

// String renders Redacted as sorted "NAME=value" pairs; safe to log.
func String(prefix string, src any) string {
	m := Redacted(prefix, src)
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, len(keys))
	for i, k := range keys {
		parts[i] = k + "=" + m[k]
	}
	return strings.Join(parts, " ")
}

// walk visits every tagged field, descending into nested structs so a
// service config can embed shared blocks.
func walk(rv reflect.Value, prefix string, visit func(reflect.Value, string, reflect.StructTag)) {
	rt := rv.Type()
	for i := 0; i < rt.NumField(); i++ {
		sf := rt.Field(i)
		if !sf.IsExported() {
			continue
		}
		f := rv.Field(i)
		tag, ok := sf.Tag.Lookup("env")
		if !ok {
			if f.Kind() == reflect.Struct && sf.Type != reflect.TypeOf(time.Duration(0)) {
				walk(f, prefix, visit)
			}
			continue
		}
		name, opt, _ := strings.Cut(tag, ",")
		if opt != "noprefix" {
			name = prefix + name
		}
		visit(f, name, sf.Tag)
	}
}

func set(f reflect.Value, raw string) error {
	if f.Type() == reflect.TypeOf(time.Duration(0)) {
		d, err := time.ParseDuration(raw)
		if err != nil {
			return err
		}
		f.SetInt(int64(d))
		return nil
	}
	switch f.Kind() {
	case reflect.String:
		f.SetString(raw)
	case reflect.Bool:
		b, err := strconv.ParseBool(raw)
		if err != nil {
			return err
		}
		f.SetBool(b)
	case reflect.Int, reflect.Int64:
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return err
		}
		f.SetInt(n)
	case reflect.Float64:
		n, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return err
		}
		f.SetFloat(n)
	default:
		return fmt.Errorf("unsupported field type %s", f.Type())
	}
	return nil
}
