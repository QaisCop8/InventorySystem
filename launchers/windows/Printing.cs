// الطباعة المباشرة داخل مشغّل NoonERP (بلا CashService): الصفحة ترسل عبر chrome.webview رسالة
// {type:"noon-print", id, pages:[{commands, printerName, paper, paperWidth, paperHeight, openDrawer}]} (lib/local-print.ts)
// فيرسم المشغّل أوامر GDI+ نفسها التي كانت تُرسل لـ CashService ويطبع على الطابعة المحددة (أو الافتراضية) بلا نافذة طباعة،
// ثم يرد {type:"noon-print-result", id, success, message}.
// الوحدات 1/100 بوصة والخط بالنقاط. الأوامر: 1 صورة، 3 مستطيل، 4 مستطيل مظلل، 5 خط، 6 نص، 7 باركود Code128.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.IO;
using System.Net;
using System.Text;

static class NoonPrinter
{
    public static void PrintPages(IList pages)
    {
        foreach (object raw in pages)
        {
            IDictionary page = raw as IDictionary;
            if (page != null) PrintPage(page);
        }
    }

    static void PrintPage(IDictionary page)
    {
        IList commands = (page["commands"] as IList) ?? new ArrayList();
        string printerName = Str(page, "printerName");
        int width = Math.Max(100, (int)Num(page, "paperWidth", 315));
        int height = Math.Max(100, (int)Num(page, "paperHeight", 1100));
        string paperName = Str(page, "paper");

        using (PrintDocument document = new PrintDocument())
        {
            if (!string.IsNullOrEmpty(printerName))
            {
                document.PrinterSettings.PrinterName = printerName;
                if (!document.PrinterSettings.IsValid) throw new Exception("الطابعة غير موجودة على هذا الجهاز: " + printerName);
            }
            else if (!document.PrinterSettings.IsValid)
            {
                throw new Exception("لا توجد طابعة افتراضية على هذا الجهاز");
            }
            document.DocumentName = "NoonERP";
            document.PrintController = new StandardPrintController();
            document.OriginAtMargins = false;
            document.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
            document.DefaultPageSettings.PaperSize = new PaperSize(string.IsNullOrEmpty(paperName) ? "NoonERP" : paperName, width, height);
            document.PrintPage += (sender, args) =>
            {
                Graphics g = args.Graphics;
                g.PageUnit = GraphicsUnit.Display;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                // الطابعة تبدأ الرسم من حافة المنطقة القابلة للطباعة — تعويضها ليطابق الرسم إحداثيات الورقة
                g.TranslateTransform(-args.PageSettings.HardMarginX, -args.PageSettings.HardMarginY);
                foreach (object item in commands)
                {
                    IDictionary command = item as IDictionary;
                    if (command != null) Draw(g, command);
                }
                args.HasMorePages = false;
            };
            document.Print();
        }
    }

    static void Draw(Graphics g, IDictionary c)
    {
        int type = (int)Num(c, "type", 0);
        float x = Num(c, "x", 0), y = Num(c, "y", 0), w = Num(c, "width", 0), h = Num(c, "height", 0);
        Color color = (int)Num(c, "brush", 2) == 3 ? Color.FromArgb(85, 85, 85) : Color.Black;
        switch (type)
        {
            case 1: DrawImage(g, Str(c, "image"), x, y, w, h); break;
            case 3: using (Pen pen = new Pen(color, 1)) g.DrawRectangle(pen, x, y, w, h); break;
            case 4: using (SolidBrush fill = new SolidBrush(Color.FromArgb(232, 232, 232))) g.FillRectangle(fill, x, y, w, h); break;
            case 5: using (Pen pen = new Pen(color, 1)) g.DrawLine(pen, x, y, w, h); break;
            case 6: DrawText(g, c, color, x, y, w, h); break;
            case 7: DrawBarcode(g, Str(c, "image"), x, y, w, h); break;
        }
    }

    static void DrawText(Graphics g, IDictionary c, Color color, float x, float y, float w, float h)
    {
        string text = Str(c, "text");
        if (text.Length == 0) return;
        string family = Str(c, "fontFamilyName");
        float size = Math.Max(4, Num(c, "fontSize", 9));
        FontStyle style = (int)Num(c, "fontStyle", 0) == 1 ? FontStyle.Bold : FontStyle.Regular;
        using (Font font = new Font(string.IsNullOrEmpty(family) ? "Arial" : family, size, style, GraphicsUnit.Point))
        using (SolidBrush solid = new SolidBrush(color))
        using (StringFormat format = new StringFormat())
        {
            // 1 = من اليمين لليسار (محاذاة يمين)، 0 = محاذاة يسار
            if ((int)Num(c, "textFormat", 1) == 1) format.FormatFlags |= StringFormatFlags.DirectionRightToLeft;
            format.Alignment = StringAlignment.Near;
            format.LineAlignment = StringAlignment.Near;
            format.Trimming = StringTrimming.None;
            g.DrawString(text, font, solid, new RectangleF(x, y, Math.Max(1, w), Math.Max(1, h)), format);
        }
    }

    static void DrawImage(Graphics g, string source, float x, float y, float w, float h)
    {
        if (string.IsNullOrWhiteSpace(source)) return;
        try
        {
            byte[] bytes;
            string value = source.Trim();
            if (value.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || value.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                using (WebClient client = new WebClient()) bytes = client.DownloadData(value);
            }
            else
            {
                int comma = value.IndexOf(',');
                if (value.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && comma > 0) value = value.Substring(comma + 1);
                bytes = Convert.FromBase64String(value);
            }
            using (MemoryStream stream = new MemoryStream(bytes))
            using (Image image = Image.FromStream(stream))
            {
                // داخل المستطيل مع الحفاظ على النسبة
                float scale = Math.Min(w / image.Width, h / image.Height);
                if (scale <= 0 || float.IsInfinity(scale) || float.IsNaN(scale)) scale = 1;
                float dw = image.Width * scale, dh = image.Height * scale;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
            }
        }
        catch { /* صورة غير صالحة لا توقف الطباعة */ }
    }

    // Code128 (المجموعة B) — جدول الأشرطة من jsbarcode
    static readonly string[] Bars = {
        "11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100", "10011001000", "10011000100",
        "10001100100", "11001001000", "11001000100", "11000100100", "10110011100", "10011011100", "10011001110", "10111001100",
        "10011101100", "10011100110", "11001110010", "11001011100", "11001001110", "11011100100", "11001110100", "11101101110",
        "11101001100", "11100101100", "11100100110", "11101100100", "11100110100", "11100110010", "11011011000", "11011000110",
        "11000110110", "10100011000", "10001011000", "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
        "11000101000", "11000100010", "10110111000", "10110001110", "10001101110", "10111011000", "10111000110", "10001110110",
        "11101110110", "11010001110", "11000101110", "11011101000", "11011100010", "11011101110", "11101011000", "11101000110",
        "11100010110", "11101101000", "11101100010", "11100011010", "11101111010", "11001000010", "11110001010", "10100110000",
        "10100001100", "10010110000", "10010000110", "10000101100", "10000100110", "10110010000", "10110000100", "10011010000",
        "10011000010", "10000110100", "10000110010", "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
        "10100111100", "10010111100", "10010011110", "10111100100", "10011110100", "10011110010", "11110100100", "11110010100",
        "11110010010", "11011011110", "11011110110", "11110110110", "10101111000", "10100011110", "10001011110", "10111101000",
        "10111100010", "11110101000", "11110100010", "10111011110", "10111101110", "11101011110", "11110101110", "11010000100",
        "11010010000", "11010011100", "1100011101011"
    };

    static void DrawBarcode(Graphics g, string value, float x, float y, float w, float h)
    {
        if (string.IsNullOrEmpty(value)) return;
        List<int> codes = new List<int>();
        codes.Add(104);
        int checksum = 104, position = 1;
        foreach (char ch in value)
        {
            int code = ch >= 32 && ch <= 127 ? ch - 32 : 0;
            codes.Add(code);
            checksum += code * position++;
        }
        codes.Add(checksum % 103);
        codes.Add(106);
        StringBuilder modules = new StringBuilder();
        foreach (int code in codes) modules.Append(Bars[code]);
        float module = w / modules.Length;
        using (SolidBrush black = new SolidBrush(Color.Black))
        {
            for (int index = 0; index < modules.Length; index++)
            {
                if (modules[index] == '1') g.FillRectangle(black, x + index * module, y, module + 0.05f, h);
            }
        }
    }

    static float Num(IDictionary d, string key, float fallback)
    {
        if (!d.Contains(key) || d[key] == null) return fallback;
        try { return Convert.ToSingle(d[key], System.Globalization.CultureInfo.InvariantCulture); } catch { return fallback; }
    }

    static string Str(IDictionary d, string key)
    {
        return d.Contains(key) && d[key] != null ? Convert.ToString(d[key], System.Globalization.CultureInfo.InvariantCulture) : "";
    }
}
