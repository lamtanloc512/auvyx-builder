<?php
/**
 * Core blocks → Auvyx elements (ADR 0029), so content made in the block editor or by a theme's patterns becomes editable
 * in Auvyx Studio: paragraph, heading, image, buttons/button, separator, spacer, group (row/stack), columns/column.
 * Colors, font sizes, spacing and radius from core's attributes become Auvyx styles; anything else stays a WordPress
 * block. Only on request (the author clicks "Convert"): it changes the saved markup.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Studio;

defined( 'ABSPATH' ) || exit;

final class Convert {

	const BLOCKS = array( 'core/paragraph', 'core/heading', 'core/image', 'core/buttons', 'core/button', 'core/separator', 'core/spacer', 'core/group', 'core/columns', 'core/column', 'core/pattern', 'core/block' );

	/**
	 * Parsed blocks with core blocks replaced by equivalent parsed Auvyx blocks (recursively).
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @return array<int, array<string, mixed>>
	 */
	public static function blocks( array $blocks ): array {
		$out = array();
		foreach ( $blocks as $block ) {
			if ( 'core/pattern' === ( $block['blockName'] ?? '' ) ) {
				// A pattern reference becomes the pattern's own blocks, converted (an unknown pattern stays as it is).
				$pattern = \WP_Block_Patterns_Registry::get_instance()->get_registered( (string) ( $block['attrs']['slug'] ?? '' ) );
				if ( $pattern ) {
					array_push( $out, ...self::blocks( parse_blocks( (string) $pattern['content'] ) ) );
					continue;
				}
			}
			if ( 'core/block' === ( $block['blockName'] ?? '' ) ) {
				// A pattern of the site's own is copied in (a component stays a reference).
				$inner = Library::pattern_blocks( (int) ( $block['attrs']['ref'] ?? 0 ) );
				if ( null !== $inner ) {
					array_push( $out, ...self::blocks( $inner ) );
					continue;
				}
			}
			if ( null !== ( $block['blockName'] ?? null ) || '' !== trim( (string) ( $block['innerHTML'] ?? '' ) ) ) {
				$out[] = self::block( $block );
			}
		}
		return $out;
	}

	/**
	 * @param array<string, mixed> $block Parsed block.
	 * @return array<string, mixed>
	 */
	public static function block( array $block ): array {
		$node = self::convert( $block );
		// The block's own classes travel with it (a theme's styles hook on them), with the color classes WordPress adds.
		$attrs   = (array) ( $block['attrs'] ?? array() );
		$classes = array_filter(
			array(
				(string) ( $attrs['className'] ?? '' ),
				(string) ( $node['attrs']['className'] ?? '' ),
				isset( $attrs['textColor'] ) || isset( $attrs['style']['color']['text'] ) ? 'has-text-color' : '',
				isset( $attrs['backgroundColor'] ) || isset( $attrs['style']['color']['background'] ) ? 'has-background' : '',
			)
		);
		if ( $classes && ( $node['blockName'] ?? '' ) !== ( $block['blockName'] ?? '' ) ) {
			$node['attrs']['className'] = implode( ' ', array_unique( preg_split( '/\s+/', implode( ' ', $classes ) ) ) );
		}
		if ( ( $node['blockName'] ?? '' ) !== ( $block['blockName'] ?? '' ) && isset( $attrs['align'] ) && in_array( $attrs['align'], array( 'wide', 'full' ), true ) ) {
			$node['attrs']['align'] = $attrs['align'];
		}
		return $node;
	}

	/**
	 * @param array<string, mixed> $block Parsed block.
	 * @return array<string, mixed>
	 */
	private static function convert( array $block ): array {
		$name  = (string) ( $block['blockName'] ?? '' );
		$attrs = (array) ( $block['attrs'] ?? array() );
		$html  = (string) ( $block['innerHTML'] ?? '' );
		$base  = self::styles( $attrs );
		switch ( $name ) {
			case 'core/paragraph':
				return self::auvyx( 'auvyx/text', array(), '<p>' . self::inner( $html, 'p' ) . '</p>', $base );
			case 'core/heading':
				$level = max( 1, min( 6, (int) ( $attrs['level'] ?? 2 ) ) );
				return self::auvyx( 'auvyx/heading', 2 === $level ? array() : array( 'level' => $level ), '<h' . $level . '>' . self::inner( $html, 'h[1-6]' ) . '</h' . $level . '>', $base );
			case 'core/image':
				$src = preg_match( '#<img\b[^>]*\ssrc="([^"]*)"#i', $html, $m ) ? $m[1] : '';
				$alt = preg_match( '#<img\b[^>]*\salt="([^"]*)"#i', $html, $m ) ? $m[1] : '';
				$img = '<img src="' . $src . '" alt="' . $alt . '"/>';
				$a   = preg_match( '#<a\b[^>]*\shref="([^"]*)"#i', $html, $m ) ? '<a href="' . $m[1] . '">' . $img . '</a>' : $img;
				$id  = isset( $attrs['id'] ) ? array( 'id' => (int) $attrs['id'] ) : array();
				return self::auvyx( 'auvyx/image', $id, $a, $base + array( 'max-width' => '100%' ) );
			case 'core/button':
				$text = preg_match( '#<a\b[^>]*>(.*?)</a>#is', $html, $m ) ? $m[1] : wp_strip_all_tags( $html );
				$href = preg_match( '#<a\b[^>]*\shref="([^"]*)"#i', $html, $m ) ? ' href="' . $m[1] . '"' : '';
				// Core's markup, kept: a `wp-block-button` box (with the block's own classes, `is-style-outline` among them)
				// around a link with core's link classes. Core's and the theme's button styles hook on exactly these, so the
				// button keeps the look it had (the theme's fill, its outline style) instead of Auvyx's default button.
				$link                       = self::auvyx( 'auvyx/button', array( 'className' => 'wp-block-button__link wp-element-button' ), '<a' . $href . '>' . $text . '</a>', $base );
				$wrap                       = self::section( array( $link ), array() );
				$wrap['attrs']['className'] = 'wp-block-button';
				return $wrap;
			case 'core/separator':
				return self::auvyx( 'auvyx/divider', array(), '<hr/>', $base );
			case 'core/spacer':
				return self::section( array(), $base + array( 'height' => self::length( (string) ( $attrs['height'] ?? '100px' ) ) ) );
			case 'core/buttons':
				$justify = self::justify( (string) ( $attrs['layout']['justifyContent'] ?? '' ) );
				return self::section(
					self::blocks( $block['innerBlocks'] ?? array() ),
					array_merge(
						array(
							'display'     => 'flex',
							'flex-wrap'   => 'wrap',
							'align-items' => 'center',
							'gap'         => '12px',
						),
						'' !== $justify ? array( 'justify-content' => $justify ) : array(),
						$base
					)
				);
			case 'core/columns':
				return self::section(
					self::blocks( $block['innerBlocks'] ?? array() ),
					array_merge(
						array(
							'display' => 'flex',
							'gap'     => self::gap( $attrs, '32px' ),
						),
						$base
					),
					array( 'flex-direction' => 'column' )
				);
			case 'core/column':
				$width = (string) ( $attrs['width'] ?? '' );
				return self::section(
					self::blocks( $block['innerBlocks'] ?? array() ),
					array_merge(
						array(
							'display'        => 'flex',
							'flex-direction' => 'column',
							'gap'            => self::gap( $attrs, '16px' ),
							// Like WordPress: a column with a width keeps it as a basis but still gives way to the gap.
							'flex'           => '' !== $width ? '0 1 ' . self::length( $width ) : '1 1 0',
							'min-width'      => '0',
						),
						$base
					),
					array( 'flex' => '1 1 auto' )
				);
			case 'core/group':
				$layout = (array) ( $attrs['layout'] ?? array() );
				$type   = (string) ( $layout['type'] ?? 'default' );
				$align  = isset( $attrs['align'] ) && in_array( $attrs['align'], array( 'wide', 'full' ), true ) ? array( 'align' => $attrs['align'] ) : array();
				$tag    = in_array( $attrs['tagName'] ?? 'div', array( 'section', 'div', 'header', 'footer', 'main', 'article', 'aside', 'nav' ), true ) ? (string) ( $attrs['tagName'] ?? 'div' ) : 'div';
				if ( in_array( $type, array( 'constrained', 'default', 'grid' ), true ) ) {
					// A flow group keeps WordPress's layout class (the theme's global styles space its children); a constrained
					// one becomes a flow group whose content and wide widths and root padding are Auvyx styles (below).
					if ( 'grid' === $type ) {
						$count   = (int) ( $layout['columnCount'] ?? 0 );
						$min     = (string) ( $layout['minimumColumnWidth'] ?? '' );
						$columns = '' !== $min
							? 'repeat(auto-fill, minmax(min(' . ( $count > 0 ? 'max(' . self::length( $min ) . ', (100% - ' . self::gap( $attrs, '24px' ) . ' * ' . ( $count - 1 ) . ') / ' . $count . ')' : self::length( $min ) ) . ', 100%), 1fr))'
							: 'repeat(' . max( 1, $count ? $count : 3 ) . ', minmax(0, 1fr))';
						$styles  = array(
							'display'               => 'grid',
							'grid-template-columns' => $columns,
							'gap'                   => self::gap( $attrs, '24px' ),
						);
						$class   = '';
					} else {
						$styles = array( 'display' => 'block' );
						$class  = 'constrained' === $type ? 'is-layout-constrained has-global-padding' : 'is-layout-flow';
					}
					$children = self::blocks( $block['innerBlocks'] ?? array() );
					if ( 'constrained' === $type ) {
						// The theme caps a constrained group's children through `.is-layout-constrained > *`, a rule no
						// Auvyx style can undo. Written as the children's own max-width and centring, the cap shows in the
						// inspector and can be changed; the flow class keeps the theme's spacing between them.
						$children = array_map(
							static function ( array $child ) use ( $layout ): array {
								return self::constrain( $child, $layout );
							},
							$children
						);
						$styles  += array(
							'padding-inline-start' => 'var(--wp--style--root--padding-left)',
							'padding-inline-end'   => 'var(--wp--style--root--padding-right)',
						);
						$class    = 'is-layout-flow';
					}
					$node          = self::section( $children, array_merge( $styles, $base ) );
					$node['attrs'] = array_merge( $node['attrs'], array( 'tagName' => $tag ), $align, '' !== $class ? array( 'className' => $class ) : array() );
					return $node;
				}
				$row  = 'flex' === $type && 'vertical' !== ( $layout['orientation'] ?? '' );
				$flex = array(
					'display'        => 'flex',
					'flex-direction' => $row ? 'row' : 'column',
					'gap'            => self::gap( $attrs, $row ? '16px' : '24px' ),
				);
				if ( $row ) {
					$flex['flex-wrap']   = 'nowrap' === ( $layout['flexWrap'] ?? '' ) ? 'nowrap' : 'wrap';
					$flex['align-items'] = 'center';
					$justify             = self::justify( (string) ( $layout['justifyContent'] ?? '' ) );
					if ( '' !== $justify ) {
						$flex['justify-content'] = $justify;
					}
				}
				$tag  = in_array( $attrs['tagName'] ?? 'div', array( 'section', 'div', 'header', 'footer', 'main', 'article', 'aside', 'nav' ), true ) ? (string) ( $attrs['tagName'] ?? 'div' ) : 'div';
				$node = self::section( self::blocks( $block['innerBlocks'] ?? array() ), array_merge( $flex, $base ) );

				$node['attrs']['tagName'] = $tag;
				if ( isset( $attrs['align'] ) && in_array( $attrs['align'], array( 'wide', 'full' ), true ) ) {
					$node['attrs']['align'] = $attrs['align'];
				}
				return $node;
		}
		if ( ! empty( $block['innerBlocks'] ) && 0 === strpos( $name, 'auvyx/' ) ) {
			$block['innerBlocks'] = self::blocks( $block['innerBlocks'] );
		}
		return $block;
	}

	/** A parsed Auvyx block (Studio::tree reads text/href/src from its HTML). */
	private static function auvyx( string $name, array $attrs, string $html, array $styles ): array {
		if ( $styles ) {
			$attrs['auvyx'] = array(
				'v'      => 1,
				'styles' => array( 'base' => array( 'default' => $styles ) ),
			);
		}
		return array(
			'blockName'    => $name,
			'attrs'        => $attrs,
			'innerBlocks'  => array(),
			'innerHTML'    => $html,
			'innerContent' => array( $html ),
		);
	}

	/**
	 * A parsed auvyx/section (div) with children and desktop / mobile styles.
	 *
	 * @param array<int, array<string, mixed>> $children Parsed children.
	 * @param array<string, string>            $styles   Desktop styles.
	 * @param array<string, string>            $mobile   Mobile overrides.
	 */
	private static function section( array $children, array $styles, array $mobile = array() ): array {
		$all = array( 'base' => array( 'default' => $styles ) );
		if ( $mobile ) {
			$all['mobile'] = array( 'default' => $mobile );
		}
		return array(
			'blockName'    => 'auvyx/section',
			'attrs'        => array(
				'tagName' => 'div',
				'auvyx'   => array(
					'v'      => 1,
					'styles' => $all,
				),
			),
			'innerBlocks'  => $children,
			'innerHTML'    => '<div></div>',
			'innerContent' => array( '<div></div>' ),
		);
	}

	/**
	 * A converted child of a constrained group with the width that layout gave it, as its own styles (styles it already
	 * has win): the content width, the wide width for `align: wide`, none for `align: full` (which reaches past the root
	 * padding instead), centred unless the layout is justified left or right. A block that is still WordPress's is wrapped
	 * in a section that carries the width: its own markup is never rewritten.
	 *
	 * @param array<string, mixed> $child  Parsed block.
	 * @param array<string, mixed> $layout The group's layout attribute.
	 * @return array<string, mixed>
	 */
	private static function constrain( array $child, array $layout ): array {
		$align = (string) ( $child['attrs']['align'] ?? '' );
		if ( 0 !== strpos( (string) ( $child['blockName'] ?? '' ), 'auvyx/' ) ) {
			$child = self::section( array( $child ), array( 'display' => 'block' ) );
			if ( in_array( $align, array( 'wide', 'full' ), true ) ) {
				$child['attrs']['align'] = $align;
			}
		}
		$justify = (string) ( $layout['justifyContent'] ?? '' );
		if ( 'full' === $align ) {
			$width = array(
				'margin-inline-start' => 'calc(var(--wp--style--root--padding-left) * -1)',
				'margin-inline-end'   => 'calc(var(--wp--style--root--padding-right) * -1)',
			);
		} else {
			$size  = 'wide' === $align ? (string) ( $layout['wideSize'] ?? '' ) : (string) ( $layout['contentSize'] ?? '' );
			$width = array(
				'max-width'           => '' !== $size ? self::value( $size ) : ( 'wide' === $align ? 'var(--wp--style--global--wide-size)' : 'var(--wp--style--global--content-size)' ),
				'margin-inline-start' => 'left' === $justify ? '0' : 'auto',
				'margin-inline-end'   => 'right' === $justify ? '0' : 'auto',
			);
		}
		$own = (array) ( $child['attrs']['auvyx']['styles']['base']['default'] ?? array() );

		$child['attrs']['auvyx'] = array_merge(
			array( 'v' => 1 ),
			(array) ( $child['attrs']['auvyx'] ?? array() ),
			array( 'styles' => array_merge( (array) ( $child['attrs']['auvyx']['styles'] ?? array() ), array( 'base' => array( 'default' => $own + $width ) ) ) )
		);
		return $child;
	}

	private static function inner( string $html, string $tag ): string {
		return preg_match( '#<(' . $tag . ')\b[^>]*>(.*)</\1>#is', $html, $m ) ? trim( $m[2] ) : trim( wp_strip_all_tags( $html ) );
	}

	/** "var:preset|spacing|50" → var(--wp--preset--spacing--50); other values as they are. */
	private static function value( string $value ): string {
		if ( preg_match( '/[;{}<>\\\\]/', $value ) ) {
			return ''; // never anything that could leave the declaration
		}
		if ( 0 === strpos( $value, 'var:' ) ) {
			return 'var(--wp--' . str_replace( '|', '--', substr( $value, 4 ) ) . ')';
		}
		return $value;
	}

	private static function length( string $value ): string {
		return is_numeric( $value ) ? $value . 'px' : self::value( $value );
	}

	private static function gap( array $attrs, string $fallback ): string {
		$gap = $attrs['style']['spacing']['blockGap'] ?? '';
		if ( is_array( $gap ) ) {
			$gap = $gap['left'] ?? ( $gap['top'] ?? '' );
		}
		return '' !== (string) $gap ? self::value( (string) $gap ) : $fallback;
	}

	private static function justify( string $value ): string {
		$map = array(
			'left'          => 'flex-start',
			'center'        => 'center',
			'right'         => 'flex-end',
			'space-between' => 'space-between',
		);
		return $map[ $value ] ?? '';
	}

	/**
	 * Core presentation attributes → Auvyx declarations (desktop).
	 *
	 * @param array<string, mixed> $attrs Block attributes.
	 * @return array<string, string>
	 */
	public static function styles( array $attrs ): array {
		$out   = array();
		$style = (array) ( $attrs['style'] ?? array() );
		if ( isset( $attrs['textColor'] ) ) {
			$out['color'] = 'var(--wp--preset--color--' . sanitize_key( $attrs['textColor'] ) . ')';
		}
		if ( isset( $attrs['backgroundColor'] ) ) {
			$out['background-color'] = 'var(--wp--preset--color--' . sanitize_key( $attrs['backgroundColor'] ) . ')';
		}
		if ( isset( $attrs['fontSize'] ) ) {
			$out['font-size'] = 'var(--wp--preset--font-size--' . sanitize_key( $attrs['fontSize'] ) . ')';
		}
		$pairs = array(
			'color'            => $style['color']['text'] ?? null,
			'background-color' => $style['color']['background'] ?? null,
			'font-size'        => $style['typography']['fontSize'] ?? null,
			'font-weight'      => $style['typography']['fontWeight'] ?? null,
			'line-height'      => $style['typography']['lineHeight'] ?? null,
			'border-radius'    => is_string( $style['border']['radius'] ?? null ) ? $style['border']['radius'] : null,
			'text-align'       => $attrs['textAlign'] ?? ( $attrs['align'] ?? null ),
		);
		foreach ( $pairs as $prop => $value ) {
			if ( is_scalar( $value ) && '' !== (string) $value && ( 'text-align' !== $prop || in_array( $value, array( 'left', 'center', 'right' ), true ) ) && '' !== self::value( (string) $value ) ) {
				$out[ $prop ] = self::value( (string) $value );
			}
		}
		foreach ( array( 'padding', 'margin' ) as $box ) {
			foreach ( (array) ( $style['spacing'][ $box ] ?? array() ) as $side => $value ) {
				$logical = array(
					'top'    => 'block-start',
					'bottom' => 'block-end',
					'left'   => 'inline-start',
					'right'  => 'inline-end',
				);
				if ( isset( $logical[ $side ] ) && is_scalar( $value ) && '' !== self::value( (string) $value ) ) {
					$out[ $box . '-' . $logical[ $side ] ] = self::value( (string) $value );
				}
			}
		}
		return $out;
	}
}
