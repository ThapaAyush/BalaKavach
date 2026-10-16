export function createChildController({ familyChildService }) {
  return Object.freeze({
    async list(req, res, next) {
      try {
        const children = await familyChildService.listChildren(req.parent.id);
        return res.status(200).json({ ok: true, data: { children } });
      } catch (error) {
        return next(error);
      }
    },

    async create(req, res, next) {
      try {
        const child = await familyChildService.createChild(req.parent.id, req.validatedBody);
        return res.status(201).json({ ok: true, data: { child } });
      } catch (error) {
        return next(error);
      }
    },

    async get(req, res, next) {
      try {
        const child = await familyChildService.getChild(req.parent.id, req.params.childId);
        return res.status(200).json({ ok: true, data: { child } });
      } catch (error) {
        return next(error);
      }
    },

    async update(req, res, next) {
      try {
        const child = await familyChildService.updateChild(req.parent.id, req.params.childId, req.validatedBody);
        return res.status(200).json({ ok: true, data: { child } });
      } catch (error) {
        return next(error);
      }
    },

    async delete(req, res, next) {
      try {
        await familyChildService.deleteChild(req.parent.id, req.params.childId);
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    },
  });
}
