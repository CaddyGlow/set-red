import { InstanceAdminStatusSchema } from '#shared/schemas/admin'
import { setInstanceAdminStatus } from '../../../../services/instance-admin'

export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const { enabled } = await readValidatedBody(event, InstanceAdminStatusSchema.parse)
  return await setInstanceAdminStatus(event, id, enabled)
})
