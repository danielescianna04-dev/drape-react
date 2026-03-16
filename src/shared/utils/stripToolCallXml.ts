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
  // Remove <tool_output>...</tool_output> blocks (Gemini leaks these as text)
  cleaned = cleaned.replace(/<tool_output>[\s\S]*?<\/tool_output>/g, '');
  cleaned = cleaned.replace(/<\/?tool_output>/g, '');
  // Remove JSON tool call arrays: [{"name": "read_file", ...}, ...]
  cleaned = cleaned.replace(/\[\s*\{\s*"name"\s*:\s*"(?:read_file|write_file|edit_file|run_command|list_directory|glob_search|grep_search|multi_edit_file|launch_sub_agent|signal_completion|todo_write|ask_user_question)"[\s\S]*?\}\s*\]/g, '');
  return cleaned.trim();
}
