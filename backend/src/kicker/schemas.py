from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

# SQLite loses timezone info; ensure datetimes are serialized as UTC with 'Z'.
UTCDatetime = Annotated[
    datetime,
    PlainSerializer(
        lambda dt: dt.replace(tzinfo=None).isoformat() + "Z" if dt.tzinfo else dt.isoformat() + "Z",
        return_type=str,
    ),
]

Mode = Literal["doubles", "singles"]
Position = Literal["attacker", "defender", "singles"]
Role = Literal["admin", "moderator", "user"]


def _trim_name(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("name must not be empty")
    return v


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    avatar_url: str | None
    role: Role
    has_password: bool
    organization_id: int
    rating_attacker: float
    rating_defender: float
    rating_singles: float
    games_attacker: int
    games_defender: int
    games_singles: int
    created_at: UTCDatetime

    @classmethod
    def from_user(cls, user) -> "UserOut":
        return cls(
            id=user.id,
            name=user.name,
            avatar_url=user.avatar_url,
            role=user.role,
            has_password=user.password_hash is not None,
            organization_id=user.organization_id,
            rating_attacker=user.rating_attacker,
            rating_defender=user.rating_defender,
            rating_singles=user.rating_singles,
            games_attacker=user.games_attacker,
            games_defender=user.games_defender,
            games_singles=user.games_singles,
            created_at=user.created_at,
        )


class UserCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    role: Role = "user"
    password: str | None = Field(default=None, min_length=8, max_length=256)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        return _trim_name(v)


class UserUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    role: Role | None = None

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return _trim_name(v) if v is not None else None


class UserCreateOut(BaseModel):
    user: UserOut
    password_set_url: str | None = None


class LoginIn(BaseModel):
    name: str
    password: str

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class PasswordSetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=256)


class PasswordLookupIn(BaseModel):
    token: str


class PasswordChangeIn(BaseModel):
    current_password: str | None = None
    new_password: str = Field(min_length=8, max_length=256)


class MatchPlayerIn(BaseModel):
    user_id: int
    team: Literal[1, 2]
    position: Position


class MatchCreateIn(BaseModel):
    mode: Mode
    goals_to_win: int = Field(ge=1, le=99)
    team1_score: int = Field(ge=0)
    team2_score: int = Field(ge=0)
    players: list[MatchPlayerIn]


class MatchPlayerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    team: int
    position: Position
    rating_before: float
    rating_after: float
    rating_delta: float


class MatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mode: Mode
    goals_to_win: int
    team1_score: int
    team2_score: int
    winner_team: int
    created_at: UTCDatetime
    created_by_user_id: int | None
    players: list[MatchPlayerOut]


class MatchListOut(BaseModel):
    items: list[MatchOut]
    total: int


class BalanceIn(BaseModel):
    player_ids: list[int] = Field(min_length=4, max_length=4)


class LineupOut(BaseModel):
    team1_attacker: int
    team1_defender: int
    team2_attacker: int
    team2_defender: int
    win_prob_team1: float


class BalanceOut(BaseModel):
    best: LineupOut
    alternatives: list[LineupOut]


class PreviewIn(BaseModel):
    mode: Mode
    goals_to_win: int = Field(ge=1, le=99)
    players: list[MatchPlayerIn]


class PreviewOutcome(BaseModel):
    team1_score: int
    team2_score: int
    deltas: dict[int, float]


class PreviewOut(BaseModel):
    win_prob_team1: float
    outcomes: list[PreviewOutcome]


class SettingsOut(BaseModel):
    default_goals_to_win: int


class SettingsIn(BaseModel):
    default_goals_to_win: int = Field(ge=1, le=99)


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class OrganizationCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class OrganizationUpdateIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
