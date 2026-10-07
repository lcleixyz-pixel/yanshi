#!/usr/bin/env python3
"""Restore catalogued asset files from a verified snapshot without overwriting edits."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile


GROUPS = ("current-master", "current-rebuild", "legacy", "reference-gallery", "all")
SCRIPT = Path(__file__).resolve()
CATALOG = SCRIPT.with_name("archive-catalog.json")
REPOSITORY = SCRIPT.parents[3]


class RestoreError(Exception):
    pass


def file_identity(path):
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def safe_path(root, relative):
    """Keep both snapshot reads and destination writes within their chosen roots."""
    path = root.joinpath(*PurePosixPath(relative).parts)
    current = root
    parts = PurePosixPath(relative).parts
    for index, component in enumerate(parts):
        current = current / component
        if current.is_symlink():
            raise RestoreError(f"Refusing symlink in asset path: {current}")
        if index < len(parts) - 1 and current.exists() and not current.is_dir():
            raise RestoreError(f"Asset parent is not a directory: {current}")
    if not path.resolve().is_relative_to(root):
        raise RestoreError(f"Asset path escapes its root: {relative}")
    return path


def read_catalog(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("formatVersion") != 1:
        raise RestoreError("Unsupported archive catalog format; expected formatVersion 1")
    if not isinstance(data.get("archiveId"), str) or not data["archiveId"]:
        raise RestoreError("Archive catalog is missing archiveId")
    entries = data.get("entries")
    if not isinstance(entries, list):
        raise RestoreError("Archive catalog entries must be a list")
    seen = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise RestoreError("Invalid archive catalog entry")
        relative = entry.get("path")
        if (not isinstance(relative, str) or not relative
                or "\\" in relative or "\x00" in relative
                or ":" in relative.split("/")[0]
                or any(part in ("", ".", "..") for part in relative.split("/"))):
            raise RestoreError(f"Invalid relative asset path: {relative!r}")
        if relative in seen:
            raise RestoreError(f"Duplicate archive catalog path: {relative}")
        seen.add(relative)
        if type(entry.get("bytes")) is not int or entry["bytes"] < 0:
            raise RestoreError(f"Invalid byte count: {relative}")
        checksum = entry.get("sha256")
        if not isinstance(checksum, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", checksum):
            raise RestoreError(f"Invalid SHA-256: {relative}")
        groups = entry.get("groups")
        if (not isinstance(groups, list) or not groups
                or any(not isinstance(group, str) or group not in GROUPS for group in groups)):
            raise RestoreError(f"Invalid asset groups: {relative}")
    return data


def check_file(path, entry):
    if not path.is_file():
        raise RestoreError(f"Missing or non-file asset: {path}")
    if file_identity(path) != (entry["bytes"], entry["sha256"].lower()):
        raise RestoreError(f"Size/SHA-256 mismatch: {path}")


def destination_exists(path, entry):
    if not path.exists():
        return False
    if not path.is_file() or file_identity(path) != (entry["bytes"], entry["sha256"].lower()):
        raise RestoreError(f"Refusing to overwrite different destination: {path}")
    return True


def copy_without_overwrite(source, root, entry):
    target = safe_path(root, entry["path"])
    if destination_exists(target, entry):
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    safe_path(root, entry["path"])
    # Publish a complete verified file by creating a new hard link. Unlike replace(),
    # link() cannot overwrite a destination that appeared after the preflight check.
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.restore-", dir=target.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        shutil.copyfile(source, temporary)
        check_file(temporary, entry)
        os.chmod(temporary, stat.S_IMODE(source.stat().st_mode))
        safe_path(root, entry["path"])
        try:
            os.link(temporary, target)
        except FileExistsError:
            if destination_exists(target, entry):
                return False
            raise
    finally:
        temporary.unlink(missing_ok=True)
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot-dir", type=Path, required=True,
                        help="Snapshot directory containing workspace/")
    parser.add_argument("--group", choices=GROUPS, default="current-rebuild")
    parser.add_argument("--destination", type=Path, default=REPOSITORY,
                        help="Repository root to restore into; defaults to this checkout")
    parser.add_argument("--dry-run", action="store_true",
                        help="Verify sources and destinations without creating files/directories")
    args = parser.parse_args(argv)
    try:
        catalog = read_catalog(CATALOG)
        selected = [entry for entry in catalog["entries"]
                    if args.group == "all" or args.group in entry["groups"]]
        if not selected:
            raise RestoreError(f"No catalog entries for group: {args.group}")
        snapshot = args.snapshot_dir.expanduser().resolve()
        source_root = snapshot / "workspace"
        if source_root.is_symlink() or not source_root.is_dir():
            raise RestoreError(f"Snapshot workspace directory is missing or a symlink: {source_root}")
        destination = args.destination.expanduser().resolve()
        if destination.exists() and not destination.is_dir():
            raise RestoreError(f"Destination must be a directory: {destination}")
        # Preflight the entire selection before restoring even the first file.
        plan = []
        for entry in selected:
            source = safe_path(source_root, entry["path"])
            check_file(source, entry)
            target = safe_path(destination, entry["path"])
            exists = destination_exists(target, entry)
            plan.append((entry, source, exists))
        restored = unchanged = 0
        for entry, source, exists in plan:
            if args.dry_run:
                print(f"{'UNCHANGED' if exists else 'WOULD RESTORE'} {entry['path']}")
                unchanged += int(exists)
                restored += int(not exists)
            else:
                copied = copy_without_overwrite(source, destination, entry)
                restored += int(copied)
                unchanged += int(not copied)
                print(f"{'RESTORED' if copied else 'UNCHANGED'} {entry['path']}")
        print(json.dumps({"archiveId": catalog["archiveId"], "group": args.group,
                          "dryRun": args.dry_run, "selected": len(selected),
                          "wouldRestore" if args.dry_run else "restored": restored,
                          "unchanged": unchanged}, ensure_ascii=False))
        return 0
    except (RestoreError, OSError, ValueError) as error:
        print(f"Restore failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
