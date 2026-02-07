/**
 * Strip raw XML tool call markup that some models output as text
 * instead of using native tool_use blocks.
 * Removes <function_calls>, <tool_code>, <tool_name>, </invoke>, etc.
 */
export function stripToolCallXml(text: string): string {
  if (!text) return text;
  // Remove entire XML tool call blocks: <function_calls>...</function_calls>
  let cleaned = text.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '');
  // Remove partial/unclosed tags that stream in chunks
  cleaned = cleaned.replace(/<\/?(?:function_calls|tool_code|tool_name|invoke|antml:invoke|antml:parameter|parameters)[^>]*>/g, '');
  return cleaned.trim();
}
