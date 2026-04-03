import { Metadata } from "next";
import GameClient from "./game-client";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return { title: `Match ${code} — Mine Sweeper Duel` };
}

export default async function MatchPage({ params }: Props) {
  const { code } = await params;
  return <GameClient code={code} />;
}
