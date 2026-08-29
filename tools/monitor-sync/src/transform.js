import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import { editRules } from "./edit-rules.js";
import { EditCollector } from "./edit-collector.js";

export function transformMonitorJs(sourceText, { force = false } = {}) {
  const parser = new Parser();
  parser.setLanguage(JavaScript);
  // node-tree-sitter's default internal read buffer is 32KB; monitor.js is
  // already larger than that, so an explicit bufferSize is required to avoid
  // a native "Invalid argument" error on files bigger than the default.
  const tree = parser.parse(sourceText, null, { bufferSize: 10 * 1024 * 1024 });

  const collector = new EditCollector();
  const applied = [];
  const skipped = [];

  for (const rule of editRules) {
    if (!force && rule.detectAlreadyApplied(tree.rootNode, sourceText)) {
      skipped.push(rule.id);
      continue;
    }

    const anchor = rule.locate(tree.rootNode, sourceText);
    if (!anchor) {
      throw new Error(
        `monitor-sync: could not locate anchor for rule "${rule.id}" (${rule.description}). ` +
          "Upstream source shape has likely changed; manual review required before proceeding."
      );
    }

    const edit = rule.buildEdit(anchor, sourceText);
    if (edit.kind === "insertion") {
      collector.addInsertion(edit.offset, edit.text);
    } else {
      collector.addReplacement(edit.startOffset, edit.endOffset, edit.text);
    }
    applied.push(rule.id);
  }

  return { patchedText: collector.apply(sourceText), applied, skipped };
}
