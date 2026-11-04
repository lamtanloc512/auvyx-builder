<?php
/**
 * Server-side builders for Auvyx block markup. Output must match each block's JS
 * save() so the editor accepts it without "invalid content" warnings. Used by
 * patterns now; by importers and AI abilities later.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Blocks;

defined( 'ABSPATH' ) || exit;

final class Markup {

	/**
	 * Styles helper: Markup::styles( $base, $tablet, $mobile, $base_hover ).
	 *
	 * @param array<string, string> $base   Desktop declarations.
	 * @param array<string, string> $tablet Tablet declarations.
	 * @param array<string, string> $mobile Mobile declarations.
	 * @param array<string, string> $hover  Desktop hover declarations.
	 * @return array<string, array<string, array<string, string>>>
	 */
	public static function styles( array $base, array $tablet = array(), array $mobile = array(), array $hover = array() ): array {
		$styles = array();
		if ( $base || $hover ) {
			$styles['base'] = array_filter(
				array(
					'default' => $base,
					'hover'   => $hover,
				)
			);
		}
		if ( $tablet ) {
			$styles['tablet'] = array( 'default' => $tablet );
		}
		if ( $mobile ) {
			$styles['mobile'] = array( 'default' => $mobile );
		}
		return $styles;
	}

	/**
	 * @param string[]                                            $children Serialized inner blocks.
	 * @param array<string, array<string, array<string, string>>> $styles   auvyx styles.
	 * @param array{tagName?: string, align?: string}             $attrs    Other attributes.
	 */
	public static function section( array $children, array $styles = array(), array $attrs = array() ): string {
		$tag     = $attrs['tagName'] ?? 'section';
		$classes = 'wp-block-auvyx-section' . ( empty( $attrs['align'] ) ? '' : ' align' . $attrs['align'] );
		if ( 'section' === $tag ) {
			unset( $attrs['tagName'] );
		}
		$html = sprintf( '<%1$s class="%2$s">%3$s</%1$s>', tag_escape( $tag ), esc_attr( $classes ), implode( '', $children ) );
		return self::block( 'auvyx/section', self::with_styles( $attrs, $styles ), $html );
	}

	/**
	 * @param array<string, array<string, array<string, string>>> $styles auvyx styles.
	 */
	public static function heading( string $content, int $level = 2, array $styles = array() ): string {
		$attrs = 2 === $level ? array() : array( 'level' => $level );
		$html  = sprintf( '<h%1$d class="wp-block-auvyx-heading">%2$s</h%1$d>', $level, wp_kses_post( $content ) );
		return self::block( 'auvyx/heading', self::with_styles( $attrs, $styles ), $html );
	}

	/**
	 * @param array<string, array<string, array<string, string>>> $styles auvyx styles.
	 */
	public static function text( string $content, array $styles = array() ): string {
		$html = sprintf( '<p class="wp-block-auvyx-text">%s</p>', wp_kses_post( $content ) );
		return self::block( 'auvyx/text', self::with_styles( array(), $styles ), $html );
	}

	/**
	 * @param array<string, array<string, array<string, string>>> $styles auvyx styles.
	 */
	public static function button( string $text, string $url, array $styles = array() ): string {
		$html = sprintf( '<a class="wp-block-auvyx-button" href="%s">%s</a>', esc_url( $url ), wp_kses_post( $text ) );
		return self::block( 'auvyx/button', self::with_styles( array(), $styles ), $html );
	}

	/**
	 * @param array<string, mixed> $attrs  Attributes.
	 * @param array<string, mixed> $styles auvyx styles.
	 * @return array<string, mixed>
	 */
	private static function with_styles( array $attrs, array $styles ): array {
		if ( $styles ) {
			$attrs['auvyx'] = array(
				'v'      => 1,
				'styles' => $styles,
			);
		}
		return $attrs;
	}

	/**
	 * @param array<string, mixed> $attrs Attributes.
	 */
	private static function block( string $name, array $attrs, string $html ): string {
		return get_comment_delimited_block_content( $name, $attrs, $html ) . "\n";
	}
}
