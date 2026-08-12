import { sendWebResponse, toWebRequest } from 'h3'

export default eventHandler(async (event) => {
  const response = await useBetterAuth(event).handler(toWebRequest(event))
  return sendWebResponse(event, response)
})
