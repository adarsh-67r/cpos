class Cpos < Formula
  desc "Competitive Programming Operating System terminal app"
  homepage "https://github.com/Soham109/cpos"
  version "0.1.3"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.3/cpos-aarch64-apple-darwin.tar.gz"
      sha256 "dac9f48bc43ffda4006dd375741a53a3e1256579d993f94441e7481fa358b765"
    end

    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.3/cpos-x86_64-apple-darwin.tar.gz"
      sha256 "3b279ebfdd5472e2b3a0f68be7ff5b23899206a8f494ed33b9c083d178d12d14"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.3/cpos-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "3ed0c7625beb1d595ac4ea0ceb500550e4d5b63412e42d6e58e8e7761cbcbf0e"
    end
  end

  def install
    bin.install "cpos"
  end

  test do
    assert_match "CPOS v0.1.3", shell_output("#{bin}/cpos help 2>&1")
  end
end
