{
  description = "saatchi: photograph an app doing the thing";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }:
    let forAllSystems = f: nixpkgs.lib.genAttrs
      [ "x86_64-linux" "aarch64-darwin" ]
      (system: f nixpkgs.legacyPackages.${system});
    in {
      apps = forAllSystems (pkgs: {
        default = {
          type = "app";
          program = nixpkgs.lib.getExe (pkgs.writeShellApplication {
            name = "saatchi";
            runtimeInputs = [
              pkgs.bash
              pkgs.coreutils
              pkgs.bun
              pkgs.just
              pkgs.ffmpeg
              pkgs.playwright-driver.browsers
            ] ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.procps ];
            runtimeEnv = {
              PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
              PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
              # flake source: git-tracked files only (untracked lib/*.ts is invisible
              # until `git add`; ${./.} is the same filter inside a flake)
              SAATCHI_ROOT = "${self}";
              PLAYWRIGHT_CORE = "${pkgs.playwright-driver}";
            } // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
              FONTCONFIG_FILE = pkgs.makeFontsConf {
                fontDirectories = [ pkgs.dejavu_fonts pkgs.liberation_ttf ];
              };
            };
            text = ''
              export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
              exec bash ${./saatchi.sh} "$@"
            '';
          });
        };
        publish = {
          type = "app";
          program = nixpkgs.lib.getExe (pkgs.writeShellApplication {
            name = "saatchi-publish";
            runtimeInputs = [
              pkgs.bash
              pkgs.coreutils
              pkgs.bun
              pkgs.curl
              pkgs.gh
              pkgs.ffmpeg
            ] ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.procps ];
            runtimeEnv = {
              # same flake-source rule as the default app: ${self}, git-tracked only
              SAATCHI_ROOT = "${self}";
            };
            text = ''
              exec bash ${./publish.sh} "$@"
            '';
          });
        };
      });
      checks = forAllSystems (pkgs: {
        # publish's pure parts — mime table, webm detection, markdown shaping —
        # plus the io half's parse/resolve and the stdout contract's grep shape.
        # no network; what CI can honestly cover of publish.
        publish = pkgs.runCommand "saatchi-publish-pure" { nativeBuildInputs = [ pkgs.bun pkgs.gnugrep ]; } ''
          export HOME=$TMPDIR
          cp ${./lib}/upload.ts ${./lib}/upload.test.ts ${./lib}/publish.ts .
          bun test ./upload.test.ts
          # publish.ts has no unit tests; at minimum it must parse and resolve
          # (--no-bundle + --outdir is broken in this bun; bundle to /dev/null)
          bun build ./publish.ts > /dev/null
          # stdout is the markdown block, always: exactly one writer, no console
          # litter in EITHER half of the process (upload.ts is imported — a
          # console.log there lands on fd 1 too), and the children stay piped
          test "$(grep -c 'process\.stdout\.write' publish.ts)" -eq 1
          ! grep -En 'console\.(log|warn|info)' publish.ts upload.ts
          grep -q 'stdout: "pipe"' publish.ts
          touch $out
        '';
      });
    };
}
