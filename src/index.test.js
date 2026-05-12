import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./index.js";

function captureLogs(fn) {
  const originalLog = console.log;
  const messages = [];

  console.log = (...args) => {
    messages.push(args.join(" "));
  };

  try {
    fn();
  } finally {
    console.log = originalLog;
  }

  return messages;
}

test("prints installed message by default", () => {
  const messages = captureLogs(() => run([]));
  assert.deepEqual(messages, ["claudefm is installed."]);
});

test("prints help", () => {
  const messages = captureLogs(() => run(["--help"]));
  assert.equal(messages[0], "Usage: claudefm [--help] [--version]");
});

test("prints version", () => {
  const messages = captureLogs(() => run(["--version"]));
  assert.deepEqual(messages, ["claudefm 0.0.1"]);
});
