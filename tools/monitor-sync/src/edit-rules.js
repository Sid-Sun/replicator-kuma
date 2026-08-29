import { locateFirstRequireDeclaration } from "./anchors/require-inserter.js";
import { locateMsgFallbackIf } from "./anchors/if-else-appender.js";
import { locateCertExpiryTemplateLiteral } from "./anchors/template-literal-prepender.js";

export const editRules = [
  {
    id: "require-os",
    description: 'Insert const os = require("os"); after the first top-level require',
    detectAlreadyApplied: (root, src) => /require\(\s*["']os["']\s*\)/.test(src),
    locate: (root) => locateFirstRequireDeclaration(root),
    buildEdit: (anchorNode) => ({
      kind: "insertion",
      offset: anchorNode.endIndex,
      text: '\nconst os = require("os");',
    }),
  },
  {
    id: "notify-msg-else-hostname",
    description: 'Append else branch to if (!heartbeatJSON["msg"]) {...} that prefixes hostname',
    detectAlreadyApplied: (root) => {
      const anchor = locateMsgFallbackIf(root, { requireNoElse: false });
      return anchor?.alreadyHasElse === true;
    },
    locate: (root) => locateMsgFallbackIf(root, { requireNoElse: true }),
    buildEdit: (anchor) => ({
      kind: "insertion",
      offset: anchor.lastStatementInConsequence.endIndex,
      text:
        "\n            } else {\n" +
        '                heartbeatJSON["msg"] = `[${os.hostname()}] ${heartbeatJSON["msg"]}`;',
    }),
  },
  {
    id: "cert-expiry-hostname-prefix",
    description: "Prepend hostname to cert-expiry template literal in Notification.send(...)",
    detectAlreadyApplied: (root, src) => {
      const node = locateCertExpiryTemplateLiteral(root);
      return node !== null && node.text.includes("${os.hostname()}");
    },
    locate: (root) => locateCertExpiryTemplateLiteral(root),
    buildEdit: (node) => ({
      kind: "replacement",
      startOffset: node.startIndex,
      endOffset: node.endIndex,
      text: "`[${os.hostname()}] " + node.text.slice(1),
    }),
  },
];
