import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";

const QUERY = `
(program
  (lexical_declaration
    (variable_declarator
      value: (call_expression
        function: (identifier) @callee
        arguments: (arguments (string) @module)))) @require_decl)
`;

export function locateFirstRequireDeclaration(rootNode) {
  const query = new Parser.Query(JavaScript, QUERY);
  for (const match of query.matches(rootNode)) {
    const captures = Object.fromEntries(match.captures.map((c) => [c.name, c.node]));
    if (captures.callee.text !== "require") continue;
    return captures.require_decl;
  }
  return null;
}
