import { describe, expect, it, vi } from "vitest";
import { mockGateway } from "@embabel/runtime-types";
import type { GenericGatewayContext } from "@embabel/runtime-types";
import { matchInstitutions } from "../src/api/institutions";

const match = (over: Record<string, unknown> = {}) => {
  // `organization` is merged into the nested object, never spread over it — spreading the whole
  // override at the top level replaced the organization wholesale, id and all.
  const { organization, ...top } = over;
  return {
  score: 1.0,
  chosen: true,
  ...top,
  organization: {
    id: "https://ror.org/000000000",
    // Deliberately NOT display-first: the registry returns these unordered, which is the whole reason
    // the handler looks for the display type rather than taking index 0.
    names: [
      { value: "EGH", types: ["acronym"] },
      { value: "Example General Hospital", types: ["ror_display", "label"] },
    ],
    types: ["healthcare"],
    established: 1811,
    locations: [{ geonames_details: { country_name: "Australia" } }],
    relationships: [
      { type: "child", label: "Example Research Institute", id: "https://ror.org/child00001" },
      { type: "parent", label: "Example Health Network", id: "https://ror.org/parent0001" },
      { type: "related", label: "Example University", id: "https://ror.org/related001" },
    ],
    ...(organization as object ?? {}),
  },
  };
};

const ctxWith = (matchAffiliation: ReturnType<typeof vi.fn>) =>
  mockGateway<GenericGatewayContext>({ ror: { matchAffiliation } });

describe("institution resolution", () => {
  it("takes the registry's display name, not whichever name comes first", async () => {
    const [rec] = await matchInstitutions(
      ctxWith(vi.fn().mockResolvedValue({ items: [match()] })),
      { names: ["Example General Hospital"] },
    );
    expect(rec.officialName).toBe("Example General Hospital");
    expect(rec.name).toBe("Example General Hospital"); // echoed, so the join has something to link on
    expect(rec.country).toBe("Australia");
  });

  it("picks the parent out of a mixed relationship list", async () => {
    // The reason this is a handler at all: parent, child and related arrive in one array, and a flat
    // projection cannot filter it — it can only hand every consumer two parallel lists to sift.
    const [rec] = await matchInstitutions(
      ctxWith(vi.fn().mockResolvedValue({ items: [match()] })),
      { names: ["Example General Hospital"] },
    );
    expect(rec.parent).toBe("Example Health Network");
    expect(rec.parentRorId).toBe("https://ror.org/parent0001");
  });

  it("leaves parent absent when the registry records none", async () => {
    const noRels = match({ organization: { relationships: [] } });
    const [rec] = await matchInstitutions(
      ctxWith(vi.fn().mockResolvedValue({ items: [noRels] })),
      { names: ["Standalone Institute"] },
    );
    expect(rec.parent).toBeUndefined();
  });

  it("reports an unchosen match as unchosen rather than as a match", async () => {
    const weak = match({ score: 0.72, chosen: false });
    const [rec] = await matchInstitutions(
      ctxWith(vi.fn().mockResolvedValue({ items: [weak] })),
      { names: ["Genral Hospitl"] },
    );
    expect(rec.chosen).toBe(false);
    expect(rec.score).toBe(0.72);
  });

  it("yields no record for a name the registry does not know", async () => {
    // Not a placeholder: an unresolved institution must not count as a resolved one downstream.
    const recs = await matchInstitutions(
      ctxWith(vi.fn().mockResolvedValue({ items: [] })),
      { names: ["Not A Real Place"] },
    );
    expect(recs).toEqual([]);
  });

  it("keeps resolving after one name fails", async () => {
    // A single bad affiliation string taking down the batch would read as "none of these sites are known".
    const matchAffiliation = vi.fn()
      .mockRejectedValueOnce(new Error("upstream 500"))
      .mockResolvedValueOnce({ items: [match()] });
    const recs = await matchInstitutions(ctxWith(matchAffiliation), { names: ["Broken", "Example General Hospital"] });
    expect(recs).toHaveLength(1);
    expect(recs[0].officialName).toBe("Example General Hospital");
  });

  it("resolves each distinct name once", async () => {
    const matchAffiliation = vi.fn().mockResolvedValue({ items: [match()] });
    await matchInstitutions(ctxWith(matchAffiliation), { names: ["A", " A ", "", "B"] });
    expect(matchAffiliation).toHaveBeenCalledTimes(2);
  });
});
