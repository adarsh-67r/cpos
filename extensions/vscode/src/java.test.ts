import assert from "node:assert/strict";
import test from "node:test";
import {
  javaClassName,
  javaEntryClassName,
  javaSubmissionCode,
  materializeJavaTemplate
} from "./java";

test("creates valid Q-prefixed Java class names", () => {
  assert.equal(javaClassName("1120C"), "Q1120C");
  assert.equal(javaClassName("WeirdAlgorithm"), "QWeirdAlgorithm");
  assert.equal(javaClassName("abc-def"), "Qabc_def");
  assert.equal(javaClassName(""), "QProblem");
});

test("materializes new and legacy Java templates", () => {
  assert.equal(
    materializeJavaTemplate("public class {classname} {}", "Q1120C"),
    "public class Q1120C {}"
  );
  assert.equal(
    materializeJavaTemplate("class Main { Main() {} }", "Q1120C"),
    "class Q1120C { Q1120C() {} }"
  );
});

test("rewrites the local Java class only in submission code", () => {
  const source = [
    "public class Q1120C {",
    "  // Q1120C stays in comments",
    "  String name = \"Q1120C\";",
    "  Q1120C() {}",
    "  static Q1120C create() { return new Q1120C(); }",
    "}"
  ].join("\n");
  const submitted = javaSubmissionCode(source, "Q1120C");

  assert.match(submitted, /public class Main/);
  assert.match(submitted, /Main\(\) \{\}/);
  assert.match(submitted, /static Main create\(\) \{ return new Main\(\); \}/);
  assert.match(submitted, /\/\/ Q1120C stays in comments/);
  assert.match(submitted, /"Q1120C"/);
});

test("leaves unrelated Java sources unchanged", () => {
  const source = "class Main {}";
  assert.equal(javaSubmissionCode(source, "Q1120C"), source);
});

test("detects generated and legacy Java entry classes", () => {
  assert.equal(javaEntryClassName("public class Q1120C {}", "Q1120C"), "Q1120C");
  assert.equal(javaEntryClassName("class Main { public static void main(String[] args) {} }", "1120C"), "Main");
  assert.equal(javaEntryClassName("class Solution {}", "Q1120C"), "Solution");
});
