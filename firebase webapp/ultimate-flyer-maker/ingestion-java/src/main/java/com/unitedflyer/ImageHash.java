package com.unitedflyer;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;

/**
 * 64-bit pHash (hex output) — Industrial standard.
 */
public class ImageHash {

    // ↓ Downsize target (common pHash)
    private static final int SIZE = 32;
    private static final int SMALLER = 8;

    public static String computePHash(byte[] imageBytes) throws Exception {
        BufferedImage img = ImageIO.read(new ByteArrayInputStream(imageBytes));
        if (img == null) throw new Exception("Invalid image data");

        // 1) Resize 32x32 grayscale
        BufferedImage resized = new BufferedImage(SIZE, SIZE, BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g = resized.createGraphics();
        g.drawImage(img, 0, 0, SIZE, SIZE, null);
        g.dispose();

        // 2) Build pixel array
        double[][] vals = new double[SIZE][SIZE];
        for (int y = 0; y < SIZE; y++) {
            for (int x = 0; x < SIZE; x++) {
                vals[y][x] = resized.getRaster().getSample(x, y, 0);
            }
        }

        // 3) Compute DCT
        double[][] dct = applyDCT(vals);

        // 4) Use top-left 8×8 block (excluding [0][0])
        double[] list = new double[SMALLER * SMALLER - 1];
        int index = 0;
        for (int y = 0; y < SMALLER; y++) {
            for (int x = 0; x < SMALLER; x++) {
                if (x == 0 && y == 0) continue;
                list[index++] = dct[y][x];
            }
        }

        // 5) Calculate median
        double median = median(list);

        // 6) Build 64-bit hash
        long hash = 0;
        for (double v : list) {
            hash <<= 1;
            if (v > median) hash |= 1;
        }

        // 7) Convert to hex
        return String.format("%016x", hash);
    }

    private static double[][] applyDCT(double[][] f) {
        int N = SIZE;
        double[][] F = new double[N][N];

        for (int u = 0; u < N; u++) {
            for (int v = 0; v < N; v++) {

                double sum = 0;
                for (int i = 0; i < N; i++) {
                    for (int j = 0; j < N; j++) {
                        sum += Math.cos(((2 * i + 1) * u * Math.PI) / (2 * N))
                             * Math.cos(((2 * j + 1) * v * Math.PI) / (2 * N))
                             * f[i][j];
                    }
                }

                double cu = (u == 0) ? (1 / Math.sqrt(2)) : 1;
                double cv = (v == 0) ? (1 / Math.sqrt(2)) : 1;

                F[u][v] = 0.25 * cu * cv * sum;
            }
        }
        return F;
    }

    private static double median(double[] arr) {
        double[] copy = arr.clone();
        java.util.Arrays.sort(copy);
        int mid = copy.length / 2;
        return (copy.length % 2 == 0)
                ? (copy[mid] + copy[mid - 1]) / 2.0
                : copy[mid];
    }

    public static int hammingDistance(String h1, String h2) {
        long a = Long.parseUnsignedLong(h1, 16);
        long b = Long.parseUnsignedLong(h2, 16);
        long xor = a ^ b;
        return Long.bitCount(xor);
    }
}
