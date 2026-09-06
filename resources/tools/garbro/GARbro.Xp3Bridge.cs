using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using GameRes;
using GameRes.Formats.KiriKiri;

/// <summary>
/// Non-interactive XP3 extractor for GalMusic.
///
/// GARbro's legacy ConsoleBrowser never subscribes to ParametersRequest. The
/// XP3 opener therefore treats even unencrypted archives as cancelled when it
/// asks which encryption scheme to use. This bridge explicitly selects
/// GARbro's no-encryption scheme and extracts audio entries only.
/// </summary>
internal static class GarbroXp3Bridge
{
    private static readonly HashSet<string> AudioExtensions = new HashSet<string>(
        new[] { ".ogg", ".opus", ".mp3", ".wav", ".flac", ".m4a", ".aac", ".wma" },
        StringComparer.OrdinalIgnoreCase);

    private static void Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        if (args.Length != 1)
        {
            Console.Error.WriteLine("Usage: GARbro.Xp3Bridge ARCHIVE");
            Environment.ExitCode = 2;
            return;
        }

        try
        {
            LoadSchemes();
            FormatCatalog.Instance.ParametersRequest += SelectNoEncryption;

            var archiveEntry = VFS.GetFiles(args[0]).First();
            VFS.ChDir(archiveEntry);
            var archive = ((ArchiveFileSystem)VFS.Top).Source;
            var audioEntries = archive.Dir
                .Where(entry => AudioExtensions.Contains(Path.GetExtension(entry.Name)))
                .ToList();

            foreach (var entry in audioEntries)
            {
                Console.WriteLine("Extracting {0} ...", entry.Name);
                archive.Extract(entry);
            }

            Console.WriteLine("Extracted {0} audio files", audioEntries.Count);
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.ToString());
            Environment.ExitCode = 1;
        }
    }

    private static void LoadSchemes()
    {
        var schemeFile = Path.Combine(FormatCatalog.Instance.DataDirectory, "Formats.dat");
        using (var input = File.OpenRead(schemeFile))
            FormatCatalog.Instance.DeserializeScheme(input);
    }

    private static void SelectNoEncryption(object sender, ParametersRequestEventArgs request)
    {
        if (!(sender is Xp3Opener))
            return;

        request.Options = new Xp3Options { Scheme = Xp3Opener.GetScheme("") };
        request.InputResult = true;
    }
}
