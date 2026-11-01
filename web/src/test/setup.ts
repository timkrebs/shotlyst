/**
 * test/setup.ts — Vitest setup: DOM matchers from Testing Library and
 * cleanup between tests.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
