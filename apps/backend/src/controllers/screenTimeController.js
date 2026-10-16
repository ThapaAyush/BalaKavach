export function createScreenTimeController({ screenTimeService }) {
  return Object.freeze({
    async ingest(req, res, next) {
      try {
        const result = await screenTimeService.recordScreenTime(req.device, req.validatedBody);
        return res.status(201).json({ ok: true, data: result });
      } catch (error) {
        return next(error);
      }
    },

    async getByChildAndDate(req, res, next) {
      try {
        const result = await screenTimeService.getChildScreenTime(
          req.parent.id,
          req.params.childId,
          req.query.date,
        );
        return res.status(200).json({ ok: true, data: result });
      } catch (error) {
        return next(error);
      }
    },

    async getHistory(req, res, next) {
      try {
        const limit = req.query.days ? parseInt(req.query.days, 10) : 7;
        const history = await screenTimeService.getChildScreenTimeHistory(
          req.parent.id,
          req.params.childId,
          limit,
        );
        return res.status(200).json({ ok: true, data: { history } });
      } catch (error) {
        return next(error);
      }
    },
  });
}
