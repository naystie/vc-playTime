/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Naystie
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Text } from "@components/Text";
import { classNameFactory } from "@utils/css";
import { findByCodeLazy, findByPropsLazy, findExportedComponentLazy, findStoreLazy } from "@webpack";
import { ApplicationStore, lodash, moment, Select, TextInput, useEffect, useMemo, useState, useStateFromStores } from "@webpack/common";

interface Statistic {
    application_id: string;
    total_duration: number;
    last_played_at: string;
}

interface GameApplication {
    id: string;
    name: string;
    icon: string | null;
    getIconURL(size: number): string;
    getCanonicalGameId(): string | null;
}

interface Game {
    id: string;
    name: string;
    icon: string | null;
    duration: number;
    lastPlayed: number;
}

type Sort = "duration" | "recent" | "name";

const cl = classNameFactory("vc-playtime-");

const StatisticsStore = findStoreLazy("LibraryApplicationStatisticsStore");
const ApplicationActions = findByPropsLazy("fetchApplications", "createApplication");
const fetchStatistics: () => Promise<void> = findByCodeLazy("USER_ACTIVITY_STATISTICS_FETCH_SUCCESS", ".lastFetched");
const GameControllerIcon = findExportedComponentLazy("GameControllerIcon");

const PREVIEW_COUNT = 20;
const RECENT_DAYS = 30;
const FETCH_CHUNK_SIZE = 100;

const hourFormat = new Intl.NumberFormat("en", { style: "unit", unit: "hour", unitDisplay: "long", maximumFractionDigits: 0 });
const minuteFormat = new Intl.NumberFormat("en", { style: "unit", unit: "minute", unitDisplay: "long", maximumFractionDigits: 0 });

const SORTS: Record<Sort, (a: Game, b: Game) => number> = {
    duration: (a, b) => b.duration - a.duration,
    recent: (a, b) => b.lastPlayed - a.lastPlayed,
    name: (a, b) => a.name.localeCompare(b.name)
};

function formatDuration(seconds: number) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return minutes < 60
        ? minuteFormat.format(minutes)
        : hourFormat.format(Math.round(minutes / 60));
}

function sameItems<T>(a: T[], b: T[]) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
}

function getGameApplication(id: string) {
    const app = ApplicationStore.getApplication(id) as GameApplication | undefined;
    const canonicalId = app?.getCanonicalGameId();
    return (canonicalId && ApplicationStore.getApplication(canonicalId) as GameApplication | undefined) || app;
}

async function fetchApplications(ids: string[]) {
    for (const chunk of lodash.chunk(ids, FETCH_CHUNK_SIZE)) {
        await ApplicationActions.fetchApplications(chunk, false);
    }
}

async function loadGames() {
    await fetchStatistics();

    const ids = Object.keys(StatisticsStore.applicationStatistics);
    await fetchApplications(ids);

    const canonicalIds = ids.map(id => getGameApplication(id)?.getCanonicalGameId()).filter(id => id != null);
    await fetchApplications(canonicalIds);
}

function useGames() {
    const [loaded, setLoaded] = useState(false);

    const statistics = useStateFromStores(
        [StatisticsStore],
        () => Object.values(StatisticsStore.applicationStatistics) as Statistic[],
        [],
        sameItems
    );

    const ids = useMemo(() => statistics.map(s => s.application_id), [statistics]);
    const apps = useStateFromStores([ApplicationStore], () => ids.map(getGameApplication), [ids], sameItems);

    useEffect(() => {
        loadGames().catch(() => { }).finally(() => setLoaded(true));
    }, []);

    const games = useMemo(() => {
        const merged = new Map<string, Game>();

        statistics.forEach((stat, i) => {
            const app = apps[i];
            const id = app?.getCanonicalGameId() ?? stat.application_id;
            const lastPlayed = Date.parse(stat.last_played_at);
            const game = merged.get(id);

            if (game) {
                game.duration += stat.total_duration;
                game.lastPlayed = Math.max(game.lastPlayed, lastPlayed);
            } else {
                merged.set(id, {
                    id,
                    name: app?.name ?? "Unknown game",
                    icon: app?.icon ? app.getIconURL(64) : null,
                    duration: stat.total_duration,
                    lastPlayed
                });
            }
        });

        return [...merged.values()].filter(game => game.duration >= 60);
    }, [statistics, apps]);

    return { games, loaded };
}

function Stat({ label, value }: { label: string; value: string; }) {
    return (
        <div className={cl("stat")}>
            <Text size="sm" weight="medium" className={cl("subtle")}>{label}</Text>
            <Text size="lg" weight="semibold" className={cl("strong")}>{value}</Text>
        </div>
    );
}

function GameRow({ game, longest }: { game: Game; longest: number; }) {
    return (
        <div className={cl("game")}>
            {game.icon
                ? <img className={cl("icon")} src={game.icon} alt="" />
                : <div className={cl("icon")}><GameControllerIcon size="sm" color="currentColor" /></div>}
            <div className={cl("info")}>
                <Text size="md" weight="semibold" className={cl("name")}>{game.name}</Text>
                <Text size="sm" className={cl("subtle")}>Last played {moment(game.lastPlayed).locale("en").fromNow()}</Text>
            </div>
            <div className={cl("time")}>
                <Text size="sm" weight="semibold" className={cl("strong")}>{formatDuration(game.duration)}</Text>
                <div className={cl("bar")}>
                    <div className={cl("fill")} style={{ width: `${game.duration / longest * 100}%` }} />
                </div>
            </div>
        </div>
    );
}

function PlayTimeSection() {
    const { games, loaded } = useGames();
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<Sort>("duration");
    const [expanded, setExpanded] = useState(false);

    const sorted = useMemo(() => {
        const search = query.trim().toLowerCase();
        return games
            .filter(game => game.name.toLowerCase().includes(search))
            .sort(SORTS[sort]);
    }, [games, query, sort]);

    if (!loaded) return null;

    if (!games.length) {
        return <Text size="sm" className={cl("subtle")}>No play time recorded yet.</Text>;
    }

    const total = games.reduce((sum, game) => sum + game.duration, 0);
    const longest = Math.max(...games.map(game => game.duration));
    const recent = games.filter(game => Date.now() - game.lastPlayed < RECENT_DAYS * 86_400_000).length;
    const visible = query || expanded ? sorted : sorted.slice(0, PREVIEW_COUNT);

    return (
        <div className={cl("root")}>
            <div className={cl("stats")}>
                <Stat label="Total" value={formatDuration(total)} />
                <Stat label="Games" value={String(games.length)} />
                <Stat label={`Last ${RECENT_DAYS} days`} value={`${recent} ${recent === 1 ? "game" : "games"}`} />
            </div>

            <div className={cl("toolbar")}>
                <div className={cl("search")}>
                    <TextInput placeholder="Search games" value={query} onChange={setQuery} />
                </div>
                <div className={cl("sort")}>
                    <Select
                        options={[
                            { label: "Most played", value: "duration" },
                            { label: "Recently played", value: "recent" },
                            { label: "Name", value: "name" }
                        ]}
                        isSelected={value => value === sort}
                        select={setSort}
                        serialize={String}
                        closeOnSelect
                    />
                </div>
            </div>

            <div className={cl("list")}>
                {visible.map(game => <GameRow key={game.id} game={game} longest={longest} />)}
                {!visible.length && <Text size="sm" className={cl("subtle", "empty")}>No games match your search.</Text>}
            </div>

            {!query && sorted.length > PREVIEW_COUNT && (
                <Button variant="secondary" size="small" className={cl("more")} onClick={() => setExpanded(!expanded)}>
                    {expanded ? "Show less" : `Show all ${sorted.length} games`}
                </Button>
            )}
        </div>
    );
}

export const PlayTime = ErrorBoundary.wrap(PlayTimeSection, { noop: true });
