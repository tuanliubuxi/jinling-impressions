import { visitReferences } from "@/data/travel-reference";

export function VisitReference({ placeId }: { placeId: string }) {
  const reference = visitReferences[placeId];
  if (!reference) return null;
  return <section className="visit-reference"><h3>入口、票务与开放参考</h3><dl><dt>到达落点</dt><dd>{reference.entry}</dd><dt>开放范围</dt><dd>{reference.opening}</dd><dt>预约与购票</dt><dd>{reference.booking}</dd><dt>费用范围</dt><dd>{reference.ticketYuan !== undefined ? `${reference.ticketYuan}元 · ` : "待核实 · "}{reference.ticketScope}</dd></dl><p className="field-help">核对于 {reference.checkedAt}，未来出游日仍需核实临时变化。<a href={reference.source.url} target="_blank" rel="noreferrer">查看官方参考 ↗</a></p></section>;
}
