#!/usr/bin/env python3
"""Exercise the privileged helper inside a disposable, network-isolated container.

Only the helper is mounted, read-only. Docker is replaced inside the container;
no Docker socket, host configuration, credentials or production data are mounted.
"""
import pathlib
import subprocess
import unittest
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
SHA = "a" * 40
FAKE_DOCKER = r'''#!/bin/bash
set -eu
printf '%q ' "$@" >> /fake/calls
printf '\n' >> /fake/calls
if [[ $1 == inspect ]]; then
  case "$3" in
    *Health.Status*) echo healthy ;;
    *Config.Image*)
      if [[ $4 == frontend-id ]]; then service=frontend; else service=api; fi
      echo "ghcr.io/ahmadkawkab-dev/wukna-${service}:sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ;;
    *data-protection-keys*) echo 'volume wukna-prod_data_protection_keys true' ;;
    *Destination*data*)
      if [[ -e /fake/wrong-volume ]]; then echo 'volume wrong true'; else echo 'volume wukna-prod_library_objects true'; fi ;;
    *) exit 90 ;;
  esac
  exit 0
fi
[[ $1 == compose ]] || exit 91
while [[ $# -gt 0 ]]; do
  case "$1" in config|ps|pull|up|exec) break ;; esac
  shift
done
case $1 in
  config|pull|exec) exit 0 ;;
  ps)
    case "${@: -1}" in db) echo db-id ;; api) echo api-id ;; frontend) echo frontend-id ;; seaweedfs) echo storage-id ;; *) exit 92 ;; esac ;;
  up)
    if [[ -f /fake/fail-service && ${@: -1} == "$(</fake/fail-service)" ]]; then exit 93; fi ;;
  *) exit 94 ;;
esac
'''


class ProductionDeployTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.container = "wukna-helper-test-" + uuid.uuid4().hex[:12]
        subprocess.run([
            "docker", "run", "--detach", "--name", cls.container, "--network", "none",
            "--mount", f"type=bind,src={ROOT / 'ops/production-deploy'},dst=/helper,readonly",
            "--entrypoint", "/bin/bash", "mcr.microsoft.com/dotnet/aspnet:10.0",
            "-c", "sleep infinity",
        ], check=True, capture_output=True, text=True)
        try:
            cls.shell("mkdir -p /fake; cat > /usr/bin/docker; chmod 755 /usr/bin/docker", FAKE_DOCKER)
        except BaseException:
            cls.tearDownClass()
            raise

    @classmethod
    def tearDownClass(cls):
        subprocess.run(["docker", "rm", "--force", cls.container], check=True, capture_output=True)

    @classmethod
    def shell(cls, command, stdin=None):
        return subprocess.run(["docker", "exec", "-i", cls.container, "/bin/bash", "-ceu", command],
                              input=stdin, capture_output=True, text=True, check=True).stdout

    def setUp(self):
        self.shell("""
            rm -rf /etc/wukna /home/ubuntu/wukna-deploy
            rm -f /fake/calls /fake/fail-service /fake/wrong-volume
            mkdir -p /etc/wukna/library-storage /home/ubuntu/wukna-deploy/ops
            chmod 700 /etc/wukna /etc/wukna/library-storage
            touch /etc/wukna/production.env /etc/wukna/library-storage/storage.env
            chmod 600 /etc/wukna/production.env /etc/wukna/library-storage/storage.env
            touch /etc/wukna/library-storage/library-s3.json
            chown 0:1000 /etc/wukna/library-storage/library-s3.json
            chmod 640 /etc/wukna/library-storage/library-s3.json
            for file in compose.production.yaml compose.attachments.production.yaml compose.library.production.yaml compose.library.services.yaml ops/library-filer.toml; do
                touch /home/ubuntu/wukna-deploy/$file
                chmod 644 /home/ubuntu/wukna-deploy/$file
            done
        """)

    def enable(self, *features):
        for feature in features:
            self.shell(f"printf 'enabled\\n' > /etc/wukna/{feature}.enabled; chmod 600 /etc/wukna/{feature}.enabled")

    def run_helper(self, mode="deploy", succeeds=True):
        result = subprocess.run(["docker", "exec", self.container, "/bin/bash", "-p", "/helper", mode, SHA],
                                capture_output=True, text=True)
        if succeeds:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return self.shell("cat /fake/calls 2>/dev/null || true")

    def test_check_does_not_pull_or_change_containers(self):
        self.enable("attachments", "library")
        calls = self.run_helper("check")
        self.assertNotIn(" pull ", calls)
        self.assertNotIn(" up ", calls)
        self.assertIn("--env-file /etc/wukna/library-storage/storage.env", calls)

    def test_base_only_deployment(self):
        calls = self.run_helper()
        self.assertIn("pull api frontend", calls)
        self.assertNotIn("clamd", calls)
        self.assertNotIn("seaweedfs", calls)
        self.assertNotIn("library-storage", calls)

    def test_chat_only_deployment(self):
        self.enable("attachments")
        calls = self.run_helper()
        self.assertIn("pull clamd api frontend", calls)
        self.assertLess(calls.index("900 clamd"), calls.index("120 api frontend"))
        self.assertNotIn("seaweedfs", calls)

    def test_library_with_and_without_chat_reuses_scanner(self):
        for chat_enabled in (False, True):
            with self.subTest(chat_enabled=chat_enabled):
                self.setUp()
                self.enable("library", *( ["attachments"] if chat_enabled else []))
                calls = self.run_helper()
                self.assertIn("pull seaweedfs clamd api frontend", calls)
                self.assertLess(calls.index("180 seaweedfs"), calls.index("900 clamd"))
                self.assertLess(calls.index("900 clamd"), calls.index("120 api frontend"))
                self.assertNotIn("up --detach --no-deps --pull never --wait --wait-timeout 120 db", calls)

    def test_bad_markers_stop_before_docker(self):
        for marker in ("attachments", "library"):
            with self.subTest(marker=marker):
                self.setUp()
                self.enable(marker)
                self.shell(f"chmod 644 /etc/wukna/{marker}.enabled")
                self.assertEqual(self.run_helper(succeeds=False), "")

    def test_insecure_storage_configuration_stops_before_docker(self):
        for file, mode in (("storage.env", "644"), ("library-s3.json", "600")):
            with self.subTest(file=file):
                self.setUp()
                self.enable("library")
                self.shell(f"chmod {mode} /etc/wukna/library-storage/{file}")
                self.assertEqual(self.run_helper(succeeds=False), "")

    def test_symlinked_library_file_stops_before_docker(self):
        self.enable("library")
        self.shell("mv /home/ubuntu/wukna-deploy/ops/library-filer.toml /fake/filer; ln -s /fake/filer /home/ubuntu/wukna-deploy/ops/library-filer.toml")
        self.assertEqual(self.run_helper(succeeds=False), "")

    def test_failed_dependency_prevents_application_replacement(self):
        for service in ("seaweedfs", "clamd"):
            with self.subTest(service=service):
                self.setUp()
                self.enable("library")
                self.shell(f"echo {service} > /fake/fail-service")
                calls = self.run_helper(succeeds=False)
                self.assertNotIn("120 api frontend", calls)

    def test_wrong_storage_volume_prevents_application_replacement(self):
        self.enable("library")
        self.shell("touch /fake/wrong-volume")
        calls = self.run_helper(succeeds=False)
        self.assertNotIn("900 clamd", calls)
        self.assertNotIn("120 api frontend", calls)


if __name__ == "__main__":
    unittest.main(verbosity=2)
