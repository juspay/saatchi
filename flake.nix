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
      });
    };
}
