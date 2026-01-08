import { bn } from "../contract/bn";
import { getPairStrV2 } from "../contract/contract-utils";

export class MultiRoutes {
  private sFBRoutes: string[] = [];

  private readonly middlewareRoute: string = "sFB___000";

  getsFBRoutes() {
    return this.sFBRoutes;
  }

  getsFBRoutesWithoutTick(tick: string) {
    return this.sFBRoutes.filter((item) => item !== tick);
  }

  getMiddlewareRoute() {
    return [this.middlewareRoute];
  }

  matchMultiRoute(tick0: string, tick1: string) {
    return this.sFBRoutes.includes(tick0) && this.sFBRoutes.includes(tick1);
  }

  includesRoutes(tick: string) {
    return this.sFBRoutes.includes(tick);
  }

  async init() {
    const list = await poolListDao.find({
      $or: [
        {
          tick0: this.middlewareRoute,
        },
        {
          tick1: this.middlewareRoute,
        },
      ],
    });
    const ret: string[] = [];
    for (const pool of list) {
      const { tick0, tick1 } = pool;
      const pair = getPairStrV2(tick0, tick1);
      const addLiq = bn(operator.PendingSpace.Assets.get(pair).Supply).gt("0");
      if (!addLiq) {
        continue;
      }
      const tick = this.middlewareRoute === tick0 ? tick1 : tick0;
      if (ret.includes(tick)) {
        continue;
      }
      ret.push(tick);
    }
    this.sFBRoutes = ret;
  }
}
