import { afterEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "@tanstack/react-router";
import { App } from "./App";
import { fakeApi, json, testUser } from "./test/fakeApi";

const unauthorized = json(401, { type: "/problems/unauthorized", title: "Unauthorized", status: 401 });

function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(<App history={history} />);
  return history;
}

afterEach(() => vi.unstubAllGlobals());

test("a signed-out visit to /projects lands on login and returns after signing in", async () => {
  let signedIn = false;
  const api = fakeApi({
    "GET /api/v1/auth/me": () => (signedIn ? json(200, testUser) : unauthorized.clone()),
    "POST /api/v1/auth/refresh": unauthorized,
    "POST /api/v1/auth/login": async (req) => {
      expect(await req.json()).toEqual({ email: "kim@example.com", password: "correct horse" });
      signedIn = true;
      return json(200, testUser);
    },
  });
  const history = renderAt("/projects");

  await screen.findByRole("heading", { name: "Log in" });
  expect(history.location.search).toContain("redirect=%2Fprojects");

  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "kim@example.com");
  await user.type(screen.getByLabelText("Password"), "correct horse");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  await screen.findByRole("heading", { name: "Projects" });
  expect(screen.getByText("Signed in as Kim")).toBeInTheDocument();
  expect(history.location.pathname).toBe("/projects");
  expect(api.count("POST", "/api/v1/auth/login")).toBe(1);
});

test("wrong credentials show one message, not which field was wrong", async () => {
  fakeApi({
    "GET /api/v1/auth/me": unauthorized,
    "POST /api/v1/auth/refresh": unauthorized,
    "POST /api/v1/auth/login": unauthorized,
  });
  renderAt("/login");
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email"), "kim@example.com");
  await user.type(screen.getByLabelText("Password"), "wrong one");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is wrong.");
});

test("register shows server validation and conflicts next to the fields", async () => {
  let attempt = 0;
  fakeApi({
    "GET /api/v1/auth/me": unauthorized,
    "POST /api/v1/auth/refresh": unauthorized,
    "POST /api/v1/auth/register": () =>
      ++attempt === 1
        ? json(422, {
            title: "Unprocessable Entity",
            status: 422,
            errors: [{ field: "password", message: "must be at least 8 characters" }],
          })
        : json(409, { title: "Conflict", status: 409, detail: "email is already registered" }),
  });
  renderAt("/register");
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Name"), "Kim");
  await user.type(screen.getByLabelText("Email"), "kim@example.com");
  await user.type(screen.getByLabelText("Password"), "short");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  const password = screen.getByLabelText("Password");
  await waitFor(() => expect(password).toHaveAccessibleDescription("must be at least 8 characters"));
  expect(password).toHaveAttribute("aria-invalid", "true");

  await user.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("An account with this email already exists."),
  );
});

test("signed-in users skip the login page", async () => {
  fakeApi({ "GET /api/v1/auth/me": json(200, testUser) });
  const history = renderAt("/login");
  await screen.findByRole("heading", { name: "Projects" });
  expect(history.location.pathname).toBe("/projects");
});

test("logout clears the session and returns to login", async () => {
  let signedIn = true;
  fakeApi({
    "GET /api/v1/auth/me": () => (signedIn ? json(200, testUser) : unauthorized.clone()),
    "POST /api/v1/auth/refresh": unauthorized,
    "POST /api/v1/auth/logout": () => {
      signedIn = false;
      return json(204);
    },
  });
  const history = renderAt("/projects");
  await userEvent.setup().click(await screen.findByRole("button", { name: "Log out" }));
  await screen.findByRole("heading", { name: "Log in" });
  expect(history.location.pathname).toBe("/login");
});

test("unknown paths show not-found", async () => {
  fakeApi({});
  renderAt("/nope");
  expect(await screen.findByText("This page doesn't exist.")).toBeInTheDocument();
});
