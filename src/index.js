export function run(argv = process.argv.slice(2)) {
  if (argv.includes("--version") || argv.includes("-v")) {
    console.log("claudefm 0.0.1");
    return;
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: claudefm [--help] [--version]");
    console.log("");
    console.log("Minimal CLI package placeholder for the claudefm name.");
    return;
  }

  console.log("claudefm is installed.");
}

export default {
  run
};
