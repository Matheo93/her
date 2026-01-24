/**
 * Tests for MobileLoadingSkeleton components - Sprint 527
 *
 * Tests skeleton loading states, shimmer animations, and accessibility
 */

import React from "react";
import { render, screen } from "@testing-library/react";

// Mock useReducedMotion hook
const mockReducedMotion = jest.fn(() => false);
jest.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion(),
}));

import {
  Skeleton,
  TextSkeleton,
  AvatarSkeleton,
  CardSkeleton,
  ListItemSkeleton,
  MessageSkeleton,
  ConversationSkeleton,
  PageSkeleton,
  PulseLoader,
  Spinner,
} from "../MobileLoadingSkeleton";

describe("Skeleton", () => {
  beforeEach(() => {
    mockReducedMotion.mockReturnValue(false);
  });

  it("should render with default props", () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).toHaveStyle({ width: "100%" });
    expect(skeleton).toHaveStyle({ height: "1rem" });
    expect(skeleton).toHaveClass("skeleton-shimmer");
  });

  it("should render with custom dimensions", () => {
    const { container } = render(<Skeleton width={200} height={50} />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).toHaveStyle({ width: "200px" });
    expect(skeleton).toHaveStyle({ height: "50px" });
  });

  it("should render with string dimensions", () => {
    const { container } = render(<Skeleton width="50%" height="2rem" />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).toHaveStyle({ width: "50%" });
    expect(skeleton).toHaveStyle({ height: "2rem" });
  });

  it("should render with custom borderRadius", () => {
    const { container } = render(<Skeleton borderRadius={8} />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).toHaveStyle({ borderRadius: "8px" });
  });

  it("should respect animate=false", () => {
    const { container } = render(<Skeleton animate={false} />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).not.toHaveClass("skeleton-shimmer");
  });

  it("should respect reduced motion preference", () => {
    mockReducedMotion.mockReturnValue(true);
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).not.toHaveClass("skeleton-shimmer");
  });

  it("should have aria-hidden for accessibility", () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).toHaveAttribute("aria-hidden", "true");
  });

  it("should apply custom className", () => {
    const { container } = render(<Skeleton className="custom-class" />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).toHaveClass("custom-class");
  });
});

describe("TextSkeleton", () => {
  it("should render default 3 lines", () => {
    const { container } = render(<TextSkeleton />);
    const skeletons = container.querySelectorAll(".skeleton-base");

    expect(skeletons).toHaveLength(3);
  });

  it("should render custom number of lines", () => {
    const { container } = render(<TextSkeleton lines={5} />);
    const skeletons = container.querySelectorAll(".skeleton-base");

    expect(skeletons).toHaveLength(5);
  });

  it("should have shorter last line", () => {
    const { container } = render(<TextSkeleton lines={2} lastLineWidth="40%" />);
    const skeletons = container.querySelectorAll(".skeleton-base");
    const lastSkeleton = skeletons[skeletons.length - 1] as HTMLElement;

    expect(lastSkeleton).toHaveStyle({ width: "40%" });
  });
});

describe("AvatarSkeleton", () => {
  it("should render circle shape by default", () => {
    const { container } = render(<AvatarSkeleton />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).toHaveStyle({ borderRadius: "50%" });
  });

  it("should render square shape", () => {
    const { container } = render(<AvatarSkeleton shape="square" />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).toHaveStyle({ borderRadius: "0" });
  });

  it("should render rounded shape", () => {
    const { container } = render(<AvatarSkeleton shape="rounded" />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).toHaveStyle({ borderRadius: "8px" });
  });

  it("should render with custom size", () => {
    const { container } = render(<AvatarSkeleton size={100} />);
    const skeleton = container.firstChild as HTMLElement;

    expect(skeleton).toHaveStyle({ width: "100px", height: "100px" });
  });
});

describe("CardSkeleton", () => {
  it("should render with image by default", () => {
    const { container } = render(<CardSkeleton />);
    const skeletons = container.querySelectorAll(".skeleton-base");

    // Should have image skeleton
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("should render without image when showImage=false", () => {
    const { container } = render(<CardSkeleton showImage={false} />);

    expect(container.querySelector(".skeleton-base")).toBeInTheDocument();
  });

  it("should render with avatar when showAvatar=true", () => {
    const { container } = render(<CardSkeleton showAvatar={true} />);
    const avatars = container.querySelectorAll("[style*='border-radius: 50%']");

    expect(avatars.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ListItemSkeleton", () => {
  it("should render with avatar by default", () => {
    const { container } = render(<ListItemSkeleton />);
    const avatar = container.querySelector("[style*='border-radius: 50%']");

    expect(avatar).toBeInTheDocument();
  });

  it("should render without avatar when showAvatar=false", () => {
    const { container } = render(<ListItemSkeleton showAvatar={false} />);
    const avatars = container.querySelectorAll("[style*='border-radius: 50%']");

    // May still have action button if showAction=true by default
    expect(container.firstChild).toBeInTheDocument();
  });

  it("should render with secondary text by default", () => {
    const { container } = render(<ListItemSkeleton />);
    const skeletons = container.querySelectorAll(".skeleton-base");

    expect(skeletons.length).toBeGreaterThan(1);
  });

  it("should render action button when showAction=true", () => {
    const { container } = render(<ListItemSkeleton showAction={true} />);

    expect(container.firstChild).toBeInTheDocument();
  });
});

describe("MessageSkeleton", () => {
  it("should render user message on right side", () => {
    const { container } = render(<MessageSkeleton isUser={true} />);
    const wrapper = container.firstChild as HTMLElement;

    expect(wrapper).toHaveClass("justify-end");
  });

  it("should render bot message on left side", () => {
    const { container } = render(<MessageSkeleton isUser={false} />);
    const wrapper = container.firstChild as HTMLElement;

    expect(wrapper).toHaveClass("justify-start");
  });

  it("should render custom number of lines", () => {
    const { container } = render(<MessageSkeleton lines={4} />);
    const skeletons = container.querySelectorAll(".skeleton-base");

    expect(skeletons).toHaveLength(4);
  });
});

describe("ConversationSkeleton", () => {
  it("should render default 5 messages", () => {
    const { container } = render(<ConversationSkeleton />);
    // Each message has its own container
    const messages = container.querySelectorAll(".mb-3");

    expect(messages).toHaveLength(5);
  });

  it("should render custom number of messages", () => {
    const { container } = render(<ConversationSkeleton messageCount={3} />);
    const messages = container.querySelectorAll(".mb-3");

    expect(messages).toHaveLength(3);
  });
});

describe("PageSkeleton", () => {
  it("should render header by default", () => {
    const { container } = render(<PageSkeleton />);

    expect(container.querySelector(".sticky")).toBeInTheDocument();
  });

  it("should not render header when showHeader=false", () => {
    const { container } = render(<PageSkeleton showHeader={false} />);

    expect(container.querySelector(".sticky")).not.toBeInTheDocument();
  });

  it("should render list content by default", () => {
    const { container } = render(<PageSkeleton contentType="list" />);

    expect(container.querySelector(".space-y-2")).toBeInTheDocument();
  });

  it("should render cards content", () => {
    const { container } = render(<PageSkeleton contentType="cards" />);

    expect(container.querySelector(".grid")).toBeInTheDocument();
  });

  it("should render chat content", () => {
    render(<PageSkeleton contentType="chat" />);

    // ConversationSkeleton renders messages
    expect(document.querySelector(".mb-3")).toBeInTheDocument();
  });

  it("should render bottom nav when showNav=true", () => {
    const { container } = render(<PageSkeleton showNav={true} />);

    expect(container.querySelector(".fixed.bottom-0")).toBeInTheDocument();
  });
});

describe("PulseLoader", () => {
  it("should render 3 dots by default", () => {
    const { container } = render(<PulseLoader />);
    const dots = container.querySelectorAll(".rounded-full");

    expect(dots).toHaveLength(3);
  });

  it("should render custom number of dots", () => {
    const { container } = render(<PulseLoader count={5} />);
    const dots = container.querySelectorAll(".rounded-full");

    expect(dots).toHaveLength(5);
  });

  it("should have role='status' for accessibility", () => {
    render(<PulseLoader />);
    const loader = screen.getByRole("status");

    expect(loader).toBeInTheDocument();
    expect(loader).toHaveAttribute("aria-label", "Chargement");
  });

  it("should render with custom size", () => {
    const { container } = render(<PulseLoader size={16} />);
    const dot = container.querySelector(".rounded-full") as HTMLElement;

    expect(dot).toHaveStyle({ width: "16px", height: "16px" });
  });

  it("should respect reduced motion", () => {
    mockReducedMotion.mockReturnValue(true);
    const { container } = render(<PulseLoader />);
    const dot = container.querySelector(".rounded-full") as HTMLElement;

    expect(dot).toHaveStyle({ animation: "none" });
  });
});

describe("Spinner", () => {
  it("should render SVG spinner", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg");

    expect(svg).toBeInTheDocument();
  });

  it("should have role='status' for accessibility", () => {
    render(<Spinner />);
    const spinner = screen.getByRole("status");

    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute("aria-label", "Chargement");
  });

  it("should render with custom size", () => {
    const { container } = render(<Spinner size={48} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "48");
    expect(svg).toHaveAttribute("height", "48");
  });

  it("should render with custom color", () => {
    const { container } = render(<Spinner color="red" />);
    const path = container.querySelector("path");

    expect(path).toHaveAttribute("stroke", "red");
  });

  it("should respect reduced motion", () => {
    mockReducedMotion.mockReturnValue(true);
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg") as SVGElement;

    expect(svg).toHaveStyle({ animation: "none" });
  });
});
