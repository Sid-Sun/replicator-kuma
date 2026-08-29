import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";

const QUERY = `
(if_statement
  condition: (parenthesized_expression
    (unary_expression
      operator: "!"
      argument: (subscript_expression
        object: (identifier) @cond_obj
        index: (string) @cond_key)))
  consequence: (statement_block
    (expression_statement
      (assignment_expression
        left: (subscript_expression
          object: (identifier) @assign_obj
          index: (string) @assign_key)
        right: (string) @assign_val)) @inner_stmt)) @if_stmt
`;

export function locateMsgFallbackIf(rootNode, { requireNoElse } = {}) {
  const query = new Parser.Query(JavaScript, QUERY);
  for (const match of query.matches(rootNode)) {
    const g = Object.fromEntries(match.captures.map((c) => [c.name, c.node]));
    if (g.cond_obj.text !== "heartbeatJSON") continue;
    if (g.cond_key.text !== '"msg"') continue;
    if (g.assign_obj.text !== "heartbeatJSON") continue;
    if (g.assign_key.text !== '"msg"') continue;
    if (g.assign_val.text !== '"N/A"') continue;

    const hasElse = g.if_stmt.childForFieldName("alternative") !== null;
    if (requireNoElse && hasElse) continue;

    return { ifNode: g.if_stmt, lastStatementInConsequence: g.inner_stmt, alreadyHasElse: hasElse };
  }
  return null;
}
