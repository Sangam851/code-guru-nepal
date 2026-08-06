import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourceCards, FollowUps } from "./SearchSources";
import type { AnswerSource } from "@/lib/answer-meta";

const sources: AnswerSource[] = [
  { title: "Python docs", url: "https://docs.python.org/3/", site: "docs.python.org" },
  { title: "MDN", url: "https://developer.mozilla.org/", site: "developer.mozilla.org" },
];

describe("SourceCards", () => {
  it("shows the X sources label and one card per source", () => {
    render(<SourceCards sources={sources} />);
    expect(screen.getByText("2 sources")).toBeInTheDocument();
    expect(screen.getAllByTestId("source-card")).toHaveLength(2);
  });

  it("uses singular wording for one source", () => {
    render(<SourceCards sources={[sources[0]]} />);
    expect(screen.getByText("1 source")).toBeInTheDocument();
  });

  it("links each card to its source URL and opens safely in a new tab", () => {
    render(<SourceCards sources={sources} />);
    const cards = screen.getAllByTestId("source-card");
    cards.forEach((card, i) => {
      expect(card).toHaveAttribute("href", sources[i].url);
      expect(card).toHaveAttribute("target", "_blank");
      expect(card.getAttribute("rel")).toContain("noopener");
    });
  });

  it("keeps cards tappable on mobile (touch-friendly sizing, no pointer blocking)", () => {
    render(<SourceCards sources={sources} />);
    const card = screen.getAllByTestId("source-card")[0];
    expect(card.className).toContain("touch-manipulation");
    expect(card.className).toContain("min-h-[56px]");
    expect(card.className).not.toContain("pointer-events-none");
  });

  it("renders skeleton cards while searching", () => {
    render(<SourceCards sources={[]} loading />);
    expect(screen.getByText("Searching the web…")).toBeInTheDocument();
    expect(screen.getAllByTestId("source-card-skeleton").length).toBeGreaterThan(0);
  });

  it("renders an empty state when search returned nothing", () => {
    render(<SourceCards sources={[]} />);
    expect(screen.getByText("No web sources found for this answer.")).toBeInTheDocument();
    expect(screen.queryAllByTestId("source-card")).toHaveLength(0);
  });
});

describe("FollowUps", () => {
  it("renders chips and fires the pick handler", () => {
    const onPick = vi.fn();
    render(<FollowUps questions={["Why?", "How?"]} onPick={onPick} />);
    fireEvent.click(screen.getByText("How?"));
    expect(onPick).toHaveBeenCalledWith("How?");
  });

  it("renders nothing when there are no follow-ups", () => {
    const { container } = render(<FollowUps questions={[]} onPick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});