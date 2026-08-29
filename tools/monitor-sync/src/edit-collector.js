export class EditCollector {
  constructor() {
    this.edits = [];
  }

  addInsertion(offset, text) {
    this.edits.push({ start: offset, end: offset, text });
  }

  addReplacement(startOffset, endOffset, text) {
    this.edits.push({ start: startOffset, end: endOffset, text });
  }

  apply(sourceText) {
    const sorted = [...this.edits].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) {
        throw new Error(`monitor-sync: overlapping edits at offset ${sorted[i].start}`);
      }
    }

    let result = sourceText;
    for (const edit of [...sorted].sort((a, b) => b.start - a.start)) {
      result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    }
    return result;
  }
}
