import { useEffect, useState } from "react";
import type { Jurisdiction } from "../lib/topics";
import { DATA_BASE_URL } from "../lib/clientData";
import PlacePortrait from "./PlacePortrait";
import CommonQuestions from "./CommonQuestions";
import NotableRules from "./NotableRules";
import LawBrowser from "./LawBrowser";

// One client island for the whole jurisdiction page. It fetches the (potentially
// multi-MB) per-jurisdiction file ONCE and shares the parsed document across the
// portrait, questions, notable, and browse modules — avoiding the up-to-4x
// refetch we'd incur if each module fetched on its own.
//
// `name` is passed in from the page (sourced from index.json, where the geocoder
// repairs OCR-glued slug names like "Newyorkcity" → "New York City"). We use it
// instead of the per-jurisdiction file's `data.name`, which carries the raw
// build-time name and is not regenerated when only the manifest name changes.
export default function JurisdictionModules({
  jurisId,
  name,
}: {
  jurisId: string;
  name: string;
}) {
  const [data, setData] = useState<Jurisdiction | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${DATA_BASE_URL}/${jurisId}.json`)
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
      <PlacePortrait portrait={data.portrait} name={name} laws={data.laws} />
      <CommonQuestions questions={data.questions} laws={data.laws} name={name} />
      <NotableRules notable={data.notable} laws={data.laws} name={name} />

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
