export async function readApiJson<T = any>(response: Response): Promise<T> {
  const text = await response.text()

  try {
    return JSON.parse(text) as T
  } catch {
    if (text.trimStart().startsWith('<!DOCTYPE html>')) {
      throw new Error(
        response.status === 404
          ? 'API endpoint was not found. Restart the Next.js development server and try again.'
          : `The server returned an HTML error page (${response.status}). Check the development server terminal.`
      )
    }
    throw new Error(`The server returned an invalid API response (${response.status}).`)
  }
}
