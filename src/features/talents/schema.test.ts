import { describe, expect, it } from "vitest";

import { formatDayRate, talentValues } from "./schema";

const base = {
  name: " Mara Lind ",
  type: "person",
  description: "",
  birth_date: "",
  languages: "",
  residence: "",
  contact: "",
  day_rate: "",
  tags: "",
};

describe("talentValues", () => {
  it("turns empty fields into nulls and empty lists", () => {
    expect(talentValues.parse(base)).toEqual({
      name: "Mara Lind",
      type: "person",
      description: null,
      birth_date: null,
      languages: [],
      residence: null,
      contact: null,
      day_rate: null,
      tags: [],
    });
  });

  it("splits comma-separated lists and drops blanks and duplicates", () => {
    const parsed = talentValues.parse({ ...base, languages: "English, German,, English ,", tags: "lead" });
    expect(parsed.languages).toEqual(["English", "German"]);
    expect(parsed.tags).toEqual(["lead"]);
  });

  it.each([
    ["350", 35000],
    ["350.5", 35050],
    ["350,75", 35075],
    ["0.07", 7],
    ["1234567.89", 123456789],
  ])("reads the day rate %s as %i cents", (input, cents) => {
    expect(talentValues.parse({ ...base, day_rate: input }).day_rate).toBe(cents);
  });

  it.each(["-1", "12.345", "abc", "1e3", "12345678"])("rejects the day rate %s", (input) => {
    expect(talentValues.safeParse({ ...base, day_rate: input }).success).toBe(false);
  });

  it("accepts only real calendar dates", () => {
    expect(talentValues.parse({ ...base, birth_date: "1990-02-28" }).birth_date).toBe("1990-02-28");
    expect(talentValues.safeParse({ ...base, birth_date: "1990-02-30" }).success).toBe(false);
    expect(talentValues.safeParse({ ...base, birth_date: "28.02.1990" }).success).toBe(false);
  });

  it("rejects an unknown type and a missing name", () => {
    expect(talentValues.safeParse({ ...base, type: "robot" }).success).toBe(false);
    expect(talentValues.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
});

describe("formatDayRate", () => {
  it("shows cents the way the form takes them", () => {
    expect(formatDayRate(null)).toBe("");
    expect(formatDayRate(35000)).toBe("350");
    expect(formatDayRate(35050)).toBe("350.50");
    expect(formatDayRate(7)).toBe("0.07");
  });
});
