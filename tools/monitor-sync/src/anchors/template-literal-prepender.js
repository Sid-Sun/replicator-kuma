import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";

const QUERY = `(template_string) @tpl`;

export function locateCertExpiryTemplateLiteral(rootNode) {
  const query = new Parser.Query(JavaScript, QUERY);
  for (const match of query.matches(rootNode)) {
    const node = match.captures[0].node;
    const text = node.text;
    if (
      text.includes("${this.name}][${this.url}]") &&
      text.includes("certificate ${certCN} will expire in ${daysRemaining} days")
    ) {
      return node;
    }
  }
  return null;
}
