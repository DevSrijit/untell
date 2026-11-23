// Errors that the CLI maps to exit codes. A plain Error exits with 1. These exit with 2.

/** Wrong use of a command: a missing argument, an unknown flag value. `command` names the help to show. */
export class UsageError extends Error {
  constructor(message: string, readonly command?: string) { super(message); }
}

/** A tool that the command needs is not installed. The message names the tool and the command that installs it. */
export class MissingToolError extends Error {}

/** A scene that threw while it built: the command ends at once with the scene's own message, then the fix. */
export class SceneError extends Error {
  constructor(message: string) {
    super(`the scene threw while it built: ${message.replace(/^(Uncaught )?(\(in promise\) )?\w*Error: /, "")}\n  fix: correct the scene at that error (its block and props are named in the message), then run the command again.`);
  }
}

/** A page message that is a scene's own error (an uncaught Error, also from a promise). */
export const isSceneError = (t: string) => /^(Uncaught )?(\(in promise\) )?\w*Error\b/.test(t);
