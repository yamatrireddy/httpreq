/** Indents JSON text; anything that is not valid JSON is returned unchanged. */
export const prettyJsonText = (text: string): string => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};
