#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse
import os


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve Pose Lab with no-cache headers for visual QA.")
    parser.add_argument("--port", type=int, default=8798)
    parser.add_argument("--directory", default=os.getcwd())
    args = parser.parse_args()
    os.chdir(args.directory)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), NoCacheHandler)
    print(f"serving no-cache http://127.0.0.1:{args.port}/ from {os.getcwd()}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
