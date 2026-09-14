using System;
using System.IO;
using System.Text;
using GameRes;
using GameRes.Formats.RealLive;

/// <summary>
/// Non-interactive converter for VisualArt's/RealLive NWA audio.
/// GARbro.Console only accepts archives, while GARbro's NwaAudio decoder can
/// open standalone .nwa files. This bridge exposes that decoder to the app and
/// writes a standard WAV file that Chromium/Howler can play.
/// </summary>
internal static class GarbroNwaBridge
{
    private static void Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        if (args.Length != 2)
        {
            Console.Error.WriteLine("Usage: GARbro.NwaBridge INPUT.nwa OUTPUT.wav");
            Environment.ExitCode = 2;
            return;
        }

        try
        {
            using (var file = File.OpenRead(args[0]))
            using (var input = new BinaryStream(file, Path.GetFileName(args[0])))
            {
                var format = new NwaAudio();
                using (var sound = format.TryOpen(input))
                {
                    if (sound == null)
                        throw new InvalidDataException("GARbro did not recognize this NWA file.");

                    using (var output = File.Create(args[1]))
                        new WaveAudio().Write(sound, output);
                }
            }

            Console.WriteLine("Converted {0}", Path.GetFileName(args[0]));
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.ToString());
            Environment.ExitCode = 1;
        }
    }
}
