<?php
/**
 * Fonts a design preset names, installed on the site (ADR 0031): looked up on Fontsource (open-licensed fonts,
 * including all of Google Fonts), downloaded once into the WordPress fonts folder (`wp_get_font_dir()`), then served
 * from the site — visitors never contact a third party. Variable fonts get one file per subset (Vietnamese, Latin
 * extended, Latin); static ones the weights the preset uses.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\DesignSystem;

defined( 'ABSPATH' ) || exit;

final class Fonts {

	const OPTION = 'auvyx_design_fonts';
	const API    = 'https://api.fontsource.org/v1/fonts/';
	// Font files are downloaded once from here into the uploads folder and served from this site, never linked.
	const CDN     = 'https://cdn.jsdelivr.net/fontsource/fonts/'; // phpcs:ignore PluginCheck.CodeAnalysis.Offloading.OffloadedContent
	const SUBSETS = array( 'vietnamese', 'latin-ext', 'latin' );
	const RANGES  = array(
		'latin'      => 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
		'latin-ext'  => 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
		'vietnamese' => 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
	);

	/** @return array<string, array<string, mixed>> family name → theme.json fontFamily entry */
	public static function installed(): array {
		$saved = get_option( self::OPTION, array() );
		return is_array( $saved ) ? $saved : array();
	}

	public static function slug( string $family ): string {
		return 'auvyx-' . sanitize_title( $family );
	}

	/** CSS stack with a fallback for the category. */
	public static function stack( string $family, string $category ): string {
		$fallback = array(
			'serif'       => 'Georgia, serif',
			'monospace'   => 'ui-monospace, monospace',
			'handwriting' => 'cursive',
			'display'     => 'system-ui, sans-serif',
		);
		return '"' . $family . '", ' . ( $fallback[ $category ] ?? 'system-ui, sans-serif' );
	}

	/**
	 * Installs the families that are not installed yet. Returns error messages (empty when all went well).
	 *
	 * @param string[] $families Family names.
	 * @param string[] $weights  Weights the preset uses (static fonts).
	 * @return string[]
	 */
	public static function install( array $families, array $weights = array( '400', '700' ) ): array {
		$installed = self::installed();
		$errors    = array();
		$dir       = wp_get_font_dir();
		if ( ! wp_mkdir_p( $dir['path'] ) ) {
			return array( __( 'The fonts folder cannot be created.', 'auvyx-builder' ) );
		}
		require_once ABSPATH . 'wp-admin/includes/file.php';
		foreach ( $families as $family ) {
			$family = trim( (string) $family );
			if ( '' === $family || isset( $installed[ $family ] ) || ! preg_match( '/^[A-Za-z0-9 \-]{2,60}$/', $family ) ) {
				continue;
			}
			$id   = sanitize_title( $family );
			$meta = wp_remote_get( self::API . rawurlencode( $id ), array( 'timeout' => 15 ) );
			$info = is_wp_error( $meta ) || 200 !== (int) wp_remote_retrieve_response_code( $meta ) ? null : json_decode( (string) wp_remote_retrieve_body( $meta ), true );
			if ( ! is_array( $info ) || empty( $info['family'] ) ) {
				/* translators: %s: font family */
				$errors[] = sprintf( __( '"%s" was not found in the open font library; the theme\'s fonts are used instead.', 'auvyx-builder' ), $family );
				continue;
			}
			$subsets = array_values( array_intersect( self::SUBSETS, (array) ( $info['subsets'] ?? array() ) ) );
			$faces   = array();
			$files   = array();
			if ( ! empty( $info['variable'] ) ) {
				$all = array_map( 'intval', (array) ( $info['weights'] ?? array( 400 ) ) );
				foreach ( $subsets as $subset ) {
					$files[] = array( $subset, 'wght', min( $all ) . ' ' . max( $all ), self::CDN . $id . ':vf@latest/' . $subset . '-wght-normal.woff2' );
				}
			} else {
				$available = array_map( 'strval', (array) ( $info['weights'] ?? array() ) );
				foreach ( array_intersect( array_unique( array_merge( array( '400' ), $weights ) ), $available ) as $weight ) {
					foreach ( $subsets as $subset ) {
						$files[] = array( $subset, $weight, $weight, self::CDN . $id . '@latest/' . $subset . '-' . $weight . '-normal.woff2' );
					}
				}
			}
			foreach ( $files as list( $subset, $tag, $weight, $url ) ) {
				$name = $id . '-' . $subset . '-' . $tag . '.woff2';
				$path = trailingslashit( $dir['path'] ) . $name;
				if ( ! file_exists( $path ) ) {
					$tmp = download_url( $url, 30 );
					if ( is_wp_error( $tmp ) ) {
						continue;
					}
					// Only real WOFF2 files.
					$head = (string) file_get_contents( $tmp, false, null, 0, 4 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
					if ( 'wOF2' !== $head || ! @rename( $tmp, $path ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename
						wp_delete_file( $tmp );
						continue;
					}
				}
				$faces[] = array(
					'fontFamily'   => (string) $info['family'],
					'fontStyle'    => 'normal',
					'fontWeight'   => $weight,
					'fontDisplay'  => 'swap',
					'src'          => array( trailingslashit( $dir['url'] ) . $name ),
					'unicodeRange' => self::RANGES[ $subset ],
				);
			}
			if ( ! $faces ) {
				/* translators: %s: font family */
				$errors[] = sprintf( __( '"%s" could not be downloaded; the theme\'s fonts are used instead.', 'auvyx-builder' ), $family );
				continue;
			}
			$installed[ $family ] = array(
				'slug'       => self::slug( $family ),
				'name'       => (string) $info['family'],
				'fontFamily' => self::stack( (string) $info['family'], (string) ( $info['category'] ?? 'sans-serif' ) ),
				'fontFace'   => $faces,
			);
		}
		update_option( self::OPTION, $installed, false );
		return $errors;
	}

	/** CSS value for a family name: the installed stack, or the name with a generic fallback. */
	public static function css( string $family ): string {
		$name = trim( explode( ',', $family )[0], " \"'" );
		$all  = self::installed();
		if ( isset( $all[ $name ] ) ) {
			return 'var(--wp--preset--font-family--' . $all[ $name ]['slug'] . ')';
		}
		return $family;
	}
}
