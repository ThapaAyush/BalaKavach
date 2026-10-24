export function createWebHistoryController({ webHistoryService }) {
  return Object.freeze({
    async ingest(req, res, next) {
      try {
        const result = await webHistoryService.ingestDeviceWebHistory(req.device, req.body.visits);
        return res.status(200).json({
          ok: true,
          data: result,
        });
      } catch (error) {
        return next(error);
      }
    },

    async getByChild(req, res, next) {
      try {
        const { date, search, domain, limit, page } = req.query;
        const result = await webHistoryService.getChildWebHistory(
          req.parent.id,
          req.params.childId,
          { date, search, domain, limit, page }
        );
        return res.status(200).json({
          ok: true,
          data: result,
        });
      } catch (error) {
        return next(error);
      }
    },

    async getSummary(req, res, next) {
      try {
        const { date } = req.query;
        const result = await webHistoryService.getChildWebHistorySummary(
          req.parent.id,
          req.params.childId,
          { date }
        );
        return res.status(200).json({
          ok: true,
          data: result,
        });
      } catch (error) {
        return next(error);
      }
    },
  });
}
