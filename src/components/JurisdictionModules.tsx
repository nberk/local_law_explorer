import { useEffect, useState } from "react";
import type { Jurisdiction } from "../lib/topics";
import PlacePortrait from "./PlacePortrait";
import CommonQuestions from "./CommonQuestions";
import NotableRules from "./NotableRules";
import LawBrowser from "./LawBrowser";

// One client island for the whole jurisdiction page. It fetches the (potentially
// multi-MB) per-jurisdiction file ONCE and shares the parsed document across the
// portrait, questions, notable, and browse modules — avoiding the up-to-4x
// refetch we'd incur if each module fetched on its own.
export default function JurisdictionModules({ jurisId }: { jurisId: string }) {
  const [data, setData] = useState<Jurisdiction | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/data/${jurisId}.json`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((d) => alive && setData(d))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [jurisId]);

  if (err)
    return (
      <p className="mt-8 text-[14px] text-ink-500">
        Could not load this jurisdiction’s data.
      </p>
    );
  if (!data)
    return <p className="mt-8 text-[14px] text-ink-400">Loading local laws…</p>;

  return (
    <>
      <PlacePortrait portrait={data.portrait} name={data.name} />
      <CommonQuestions
        questions={data.questions}
        laws={data.laws}
        name={data.name}
        stateName={data.stateName}
      />
      <NotableRules
        notable={data.notable}
        laws={data.laws}
        name={data.name}
        stateName={data.stateName}
      />

      <section className="mt-12 border-t border-[var(--rule)] pt-8">
        <h2 className="font-display text-[20px] font-semibold text-ink-900">
          Dig deeper: browse every rule
        </h2>
        <p className="mt-1 text-[13.5px] text-ink-500">
          The full set of substantive ordinances, by topic, with search.
        </p>
        <div className="mt-5">
          <LawBrowser jurisId={jurisId} data={data} />
        </div>
      </section>
    </>
  );
}
